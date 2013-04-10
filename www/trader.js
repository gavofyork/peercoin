var myUserID = ''+Math.floor(Math.random()*1000000)+1;
var mainRef = new Firebase("https://peercoin.firebaseio.com/");

var pc_config = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};
var pc_constraints = {"optional": [/*{"DtlsSrtpKeyAgreement": true}, */{RtpDataChannels: true}]};

var peerc = null;
var dc = null;

function signallingInit()
{
  var userRef = mainRef.child(myUserID);
  var userSDP = userRef.child("sdp");
  var userICE = userRef.child("ice");
  var userStatus = userRef.child("presence");

  userSDP.onDisconnect().remove();
  userStatus.onDisconnect().set(false);

  $(window).unload(function() {
    userSDP.set(null);
    userStatus.set(false);
  });

  // Now online.
  userStatus.set(true);

  mainRef.on("child_added", function(snapshot) {
    var data = snapshot.val();
    if (data.presence) {
      appendUser(snapshot.name());
    }
  });

  mainRef.on("child_changed", function(snapshot) {
    var data = snapshot.val();
    if (data.presence) {
      removeUser(snapshot.name());
      appendUser(snapshot.name());
    }
    if (!data.presence) {
      removeUser(snapshot.name());
    }
    if (data.sdp && data.sdp.to == myUserID) {
      if (data.sdp.type == "offer") {
        incomingOffer(data.sdp.offer, data.sdp.from)
        userSDP.set(null);
      }
      if (data.sdp.type == "answer") {
        incomingAnswer(data.sdp.answer);
        userSDP.set(null);
      }
    }
    if (data.ice && data.ice.to == myUserID) {
      var candidate = new RTCIceCandidate({
        sdpMLineIndex: data.ice.label, candidate: data.ice.candidate
      });
      peerc.addIceCandidate(candidate);
      userICE.set(null);
    }
  });
}

function error(msg) {
  console.log("ERROR: " + msg);
}

function incomingOffer(offer, fromUser)
{
    acceptCall(offer, fromUser);
};

function incomingAnswer(answer)
{
	var desc = new RTCSessionDescription(JSON.parse(answer));
	peerc.setRemoteDescription(desc, function()
	{
	    log("Call established!");
	}, error);
};

function log(info)
{
	console.log(info);
}

function appendUser(userid)
{
	if (userid == myUserID) return;

	var d = document.createElement("div");
	d.setAttribute("id", userid);

	var a = document.createElement("a");
	a.setAttribute("class", "btn btn-block btn-inverse");
	a.innerHTML = userid;

	d.appendChild(a);
	d.appendChild(document.createElement("br"));
	document.getElementById("users").appendChild(d);
}

function removeUser(userid)
{
	var d = document.getElementById(userid);
	if (d)
		document.getElementById("users").removeChild(d);
}

// TODO: refactor, this function is almost identical to initiateCall().
function acceptCall(offer, fromUser)
{
	log("Incoming call with offer " + offer + " from user " + fromUser);

	peerc = new RTCPeerConnection(pc_config, pc_constraints);

    peerc.onicecandidate = function(event)
	{
      if (event.candidate) {
        var iceSend = {
          to: fromUser,
          label: event.candidate.sdpMLineIndex,
          id: event.candidate.sdpMid,
          candidate: event.candidate.candidate
        };
        mainRef.child(iceSend.to).child("ice").set(iceSend);
      } else {
        log("End of ICE candidates");
      }
    };

	peerc.ondatachannel = function (e)
	{
		console.log("Got data channel");
		dc = e.channel;
		dc.onopen = function (e) { console.log("OPEN:" + JSON.stringify(e)); };
		dc.onmessage = function (e) { console.log("MESSAGE:" + JSON.stringify(e)); };
	};

    var desc = new RTCSessionDescription(JSON.parse(offer));
    peerc.setRemoteDescription(desc, function() {
      log("setRemoteDescription, creating answer");
      peerc.createAnswer(function(answer) {
        peerc.setLocalDescription(answer, function() {
          // Send answer to remote end.
          log("created Answer and setLocalDescription " + JSON.stringify(answer));
          var toSend = {
            type: "answer",
            to: fromUser,
            from: myUserID,
            answer: JSON.stringify(answer)
          };
          var toUser = mainRef.child(toSend.to);
          var toUserSDP = toUser.child("sdp");
          toUserSDP.set(toSend);
        }, error);
      }, error);
    }, error);
}

function connect(userid)
{
	log("Connect to user " + userid);

	peerc = new RTCPeerConnection(pc_config, pc_constraints);
	dc = peerc.createDataChannel("sendDataChannel", {reliable: false});
	dc.onopen = function (e) { console.log("OPEN:" + JSON.stringify(e)); };
	dc.onmessage = function (e) { console.log("MESSAGE:" + JSON.stringify(e)); };
    peerc.onicecandidate = function(event)
	{
		if (event.candidate)
		{
			var iceSend = {
	        	to: userid,
    	    	label: event.candidate.sdpMLineIndex,
    	    	id: event.candidate.sdpMid,
    	    	candidate: event.candidate.candidate
        	};
			mainRef.child(iceSend.to).child("ice").set(iceSend);
		} else {
        log("End of ICE candidates");
      }
    };

    peerc.createOffer(function(offer)
	{
		log("Created offer" + JSON.stringify(offer));
		peerc.setLocalDescription(offer, function()
		{
			// Send offer to remote end.
			log("setLocalDescription, sending to remote");
			var toSend = {
				type: "offer",
				to: userid,
				from: myUserID,
				offer: JSON.stringify(offer)
			};
			var toUser = mainRef.child(toSend.to);
			var toUserSDP = toUser.child("sdp");
			toUserSDP.set(toSend);
		}, error);
    }, error);
}

function endCall()
{
	peerc = null;
	dc = null;
}

function error(e) {
  if (typeof e == typeof {}) {
    alert("Oh no! " + JSON.stringify(e));
  } else {
    alert("Oh no! " + e);
  }
  endCall();
}

$(document).ready(function ()
{
	$('#offer').val(myUserID);

	signallingInit();
	$('button#connect').click(function()
	{
		connect($('input#connect').val());
	});
});

