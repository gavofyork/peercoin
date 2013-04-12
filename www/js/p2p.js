/* RTCSocket.js
 * By Gavin Wood <i@gavwood.com>, 2013.
 * Some code inspired and/or adapted from various places on the internet including:
 *   https://github.com/firebase/gupshup/
 * This code is licenced under the GNU GPL, version 2.
 */

function RTCSocket()
{
	$(window).unload(function(){this.close()});
}

RTCSocket.prototype.getBar = function()
{
    return this._bar;
};

RTCSocket.prototype.m_mainRef = new Firebase("https://peercoin.firebaseio.com/");
RTCSocket.prototype.m_config = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};
RTCSocket.prototype.m_constraints = {"optional": [{"DtlsSrtpKeyAgreement": true}, {RtpDataChannels: true}]};
RTCSocket.prototype.m_connection = null;
RTCSocket.prototype.m_data = null;
RTCSocket.prototype.m_peerId = null;
RTCSocket.prototype.m_id = null;

RTCSocket.prototype.accept = function (_from, _offer, _onMessage, _onOpen, _onClose)
{
	console.log("--- Accept from " + _from);

	this.m_connection = new RTCPeerConnection(this.m_config, this.m_constraints);
	var this_ = this;

    this.m_connection.onicecandidate = function(event)
	{
		if (this_.m_id == null)
		{
			console.log("--- ICE candidate given after connection established. Ignoring.");
			return;
		}
		if (event.candidate)
		{
			var iceSend = {
				label: event.candidate.sdpMLineIndex,
				id: event.candidate.sdpMid,
				candidate: event.candidate.candidate
			};
			this_.m_mainRef.child(_from).child("ice").child(this_.m_id).set(iceSend);
		}
    };

	this.m_connection.ondatachannel = function (e)
	{
		this_.m_data = e.channel;
		this_.m_data.onopen = function(e) { this_.opening(); if (_onOpen) _onOpen(e); };
		this_.m_data.onmessage = _onMessage;
		this_.m_data.onclose = _onClose;
	};

    var desc = new RTCSessionDescription(JSON.parse(_offer));
	this.m_connection.setRemoteDescription(desc, function()
	{
		this_.m_connection.createAnswer(function(answer)
		{
			this_.m_connection.setLocalDescription(answer, function()
			{
				var toSend = { type: "answer", answer: JSON.stringify(answer) };
				var toUserSDP = this_.m_mainRef.child(_from).child("sdp").child(this_.m_id);
				toUserSDP.set(toSend);
			}, this_.error);
		}, this_.error);
	}, this.error);
};

RTCSocket.prototype.incomingSDP = function (_snapshot)
{
	var from = _snapshot.name();
	var data = _snapshot.val();
	this.m_mainRef.child(this.m_id).child('sdp').child(from).set(null);

	if (data.type == "offer" && this.m_peerId == null)
	{
		this.m_onIncoming(from, data.offer);
		this.m_peerId = from;
	}
	else if (_snapshot.name() == this.m_peerId && data.type == "answer")
	{
		var desc = new RTCSessionDescription(JSON.parse(data.answer));
		this.m_connection.setRemoteDescription(desc, function(){}, this.error);
	}
	else
		return;

	this.m_mainRef.child(this.m_id).child('sdp').off("child_added");
	this.m_mainRef.child(this.m_id).child('ice').on("child_added", this.incomingICE.bind(this));
	this.m_mainRef.child(this.m_peerId).on("child_removed", this.outgoingControl.bind(this));
};

RTCSocket.prototype.outgoingControl = function (_snapshot)
{
	if (_snapshot.name() == "active")
		this.close();
}

RTCSocket.prototype.incomingICE = function (_snapshot)
{
	if (_snapshot.name() == this.m_peerId)
	{
		var data = _snapshot.val();
		var candidate = new RTCIceCandidate({
			sdpMLineIndex: data.label, candidate: data.candidate
		});
		this.m_connection.addIceCandidate(candidate);
	}
	this.m_mainRef.child(this.m_id).child('ice').child(_snapshot.name()).set(null);
};

RTCSocket.prototype.advertise = function (_onIncoming)
{
	var userNode = this.m_mainRef.child(this.m_id);
	userNode.onDisconnect().remove();
	$(window).unload(function() { userNode.set(null); });

	this.m_onIncoming = _onIncoming ? _onIncoming : this.accept;
	this.m_mainRef.child(this.m_id).child('sdp').on("child_added", this.incomingSDP.bind(this));
	this.m_mainRef.child(this.m_id).child('active').set(1);

	return this.m_id;
};

RTCSocket.prototype.newId = function ()
{
	return '' + Math.floor(Math.random() * 0xffffffff);
};

RTCSocket.prototype.listen = function (_onIncoming)
{
	if (!this.m_id)
	{
		this.m_id = this.newId();
		console.log("--- Listen on " + this.m_id);
		return this.advertise(_onIncoming);
	}
	else
		console.log("*** Can't listen on a busy endpoint.");
	return null;
};

RTCSocket.prototype.cancel = function ()
{
	if (this.m_id)
	{
		console.log("--- Unlisten");
		this.close();
	}
	else
		console.log("*** Can't unlisten on a dead endpoint.");
};

RTCSocket.prototype.opening = function()
{
};

RTCSocket.prototype.connect = function (_dest, _onMessage, _onOpen, _onClose)
{
	if (this.m_id)
	{
		console.log("*** Can't connect on a busy endpoint.");
		return false;
	}

	console.log("--- Connect to " + _dest);

	var this_ = this;

	this.m_id = this.newId();
	this.advertise();

	this.m_peerId = _dest;
	this.m_connection = new RTCPeerConnection(this.m_config, this.m_constraints);
	this.m_data = this.m_connection.createDataChannel("sendDataChannel", {reliable: false});
	this.m_data.onopen = function(e) { this_.opening(); if (_onOpen) _onOpen(e); };
	this.m_data.onmessage = _onMessage;
	this.m_data.onclose = _onClose;

    this.m_connection.onicecandidate = function(event)
	{
		if (this_.m_id == null)
		{
			console.log("--- ICE candidate given after connection established. Ignoring.");
			return;
		}
		if (event.candidate)
		{
			var iceSend = {
    	    	label: event.candidate.sdpMLineIndex,
    	    	id: event.candidate.sdpMid,
    	    	candidate: event.candidate.candidate
        	};
			this_.m_mainRef.child(_dest).child("ice").child(this_.m_id).set(iceSend);
		}
    };

    this.m_connection.createOffer(function(offer)
	{
		this_.m_connection.setLocalDescription(offer, function()
		{
			var toSend = { type: "offer", offer: JSON.stringify(offer) };
			this_.m_mainRef.child(_dest).child("sdp").child(this_.m_id).set(toSend);
		}, this_.error);
    }, this.error);

	return true;
};

RTCSocket.prototype.isOpen = function ()
{
	return this.m_data.readyState == 'open';
};

RTCSocket.prototype.send = function(x)
{
	if (this.isOpen())
		this.m_data.send(x);
	else
		console.log("*** Can't send on non-open socket");
};

RTCSocket.prototype.close = function ()
{
    if (this.m_peerId)
    	this.m_mainRef.child(this.m_peerId).off("child_removed");
	if (this.m_connection)
	{	
		// Clean up peer's connection for it only if we're connected
		if (this.isOpen() && this.m_peerId)
			this.m_mainRef.child(this.m_peerId).set(null);

		this.m_data.close();
		this.m_connection.close();
		this.m_connection = null;
		this.m_data = null;
	}
	if (this.m_id)
		this.m_mainRef.child(this.m_id).set(null);
	this.m_id = null;
	this.m_peerId = null;
};

RTCSocket.prototype.error = function (e)
{
	if (typeof e == typeof {})
		console.log("*** Oh no! " + JSON.stringify(e));
	else
		console.log("*** Oh no! " + e);
	this.close();
};

