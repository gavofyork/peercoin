function RTCSocket()
{
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
RTCSocket.prototype.m_id = null;

RTCSocket.prototype.accept = function (_from, _offer, _onMessage, _onOpen, _onClose)
{
	console.log("--- Accept from " + _from);

	this.m_connection = new RTCPeerConnection(this.m_config, this.m_constraints);
	var this_ = this;

    this.m_connection.onicecandidate = function(event)
	{
		if (event.candidate)
		{
			var iceSend = {
				to: _from,
				label: event.candidate.sdpMLineIndex,
				id: event.candidate.sdpMid,
				candidate: event.candidate.candidate
			};
			this_.m_mainRef.child(iceSend.to).child("ice").set(iceSend);
		}
		else
			console.log("--- Got all ICE candidates.");
    };

	this.m_connection.ondatachannel = function (e)
	{
		this_.m_data = e.channel;
		this_.m_data.onopen = function(e) { this_.m_id = null; this_.m_mainRef.child(_from).set(null); if (_onOpen) _onOpen(e); };
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
				var toSend = {
					type: "answer",
					to: _from,
					from: this_.m_id,
					answer: JSON.stringify(answer)
				};
				var toUser = this_.m_mainRef.child(toSend.to);
				var toUserSDP = toUser.child("sdp");
				toUserSDP.set(toSend);
			}, this_.error);
		}, this_.error);
	}, this.error);
};

RTCSocket.prototype.advertise = function (_onIncoming)
{
	if (_onIncoming == null)
		_onIncoming = this.accept;

	var userRef = this.m_mainRef.child(this.m_id);
	var userSDP = userRef.child("sdp");
	var userICE = userRef.child("ice");

	userSDP.onDisconnect().remove();
	$(window).unload(function() { userSDP.set(null); });

	var this_ = this;
	this.m_mainRef.on("child_changed", function(snapshot)
	{
		var data = snapshot.val();
		if (data.sdp && data.sdp.to == this_.m_id)
		{
			if (data.sdp.type == "offer")
			{
				_onIncoming(data.sdp.from, data.sdp.offer);
				userSDP.set(null);
			}
			if (data.sdp.type == "answer")
			{
				var desc = new RTCSessionDescription(JSON.parse(data.sdp.answer));
				this_.m_connection.setRemoteDescription(desc, function(){}, this_.error);
				userSDP.set(null);
			}
		}
		if (data.ice && data.ice.to == this_.m_id)
		{
			var candidate = new RTCIceCandidate({
				sdpMLineIndex: data.ice.label, candidate: data.ice.candidate
			});
			this_.m_connection.addIceCandidate(candidate);
			userICE.set(null);
		}
	});

	return this.m_id;
};

RTCSocket.prototype.newEndpointID = function ()
{
	return '' + Math.floor(Math.random() * 0xffffffff);
};

RTCSocket.prototype.listen = function (_onIncoming)
{
	if (!this.m_id)
	{
		this.m_id = this.newEndpointID();
		console.log("--- Listen on " + this.m_id);
		return this.advertise(_onIncoming);
	}
	else
		console.log("*** Can't listen on a busy endpoint.");
	return null;
};

RTCSocket.prototype.unlisten = function ()
{
	if (this.m_id)
	{
		console.log("--- Unlisten");
		this.m_mainRef.child(this.m_id).set(null);
		this.m_id = null;
	}
	else
		console.log("*** Can't unlisten on a dead endpoint.");
};

RTCSocket.prototype.connect = function (_dest, _onMessage, _onOpen, _onClose)
{
	if (this.m_id)
	{
		console.log("*** Can't connect on a busy endpoint.");
		return;
	}

	console.log("--- Connect to " + _dest);

	var this_ = this;

	this.m_id = _dest + 1;
	this.advertise();

	this.m_connection = new RTCPeerConnection(this.m_config, this.m_constraints);
	this.m_data = this.m_connection.createDataChannel("sendDataChannel", {reliable: false});
	this.m_data.onopen = function(e) { this_.m_id = null; this_.m_mainRef.child(_dest).set(null); if (_onOpen) _onOpen(e); };
	this.m_data.onmessage = _onMessage;
	this.m_data.onclose = _onClose;

    this.m_connection.onicecandidate = function(event)
	{
		if (event.candidate)
		{
			var iceSend = {
	        	to: _dest,
    	    	label: event.candidate.sdpMLineIndex,
    	    	id: event.candidate.sdpMid,
    	    	candidate: event.candidate.candidate
        	};
			this_.m_mainRef.child(iceSend.to).child("ice").set(iceSend);
		}
		else
			console.log("--- Got all ICE candidates.");
    };

    this.m_connection.createOffer(function(offer)
	{
		this_.m_connection.setLocalDescription(offer, function()
		{
			var toSend = {
				type: "offer",
				to: _dest,
				from: this_.m_id,
				offer: JSON.stringify(offer)
			};
			var toUser = this_.m_mainRef.child(toSend.to);
			var toUserSDP = toUser.child("sdp");
			toUserSDP.set(toSend);
		}, this_.error);
    }, this.error);
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
	if (this.m_connection)
	{
		this.m_connection = null;
		this.m_data = null;
		this.m_id = null;
	}
};

RTCSocket.prototype.error = function (e)
{
	if (typeof e == typeof {})
		console.log("*** Oh no! " + JSON.stringify(e));
	else
		console.log("*** Oh no! " + e);
	this.close();
};
