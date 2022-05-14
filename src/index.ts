import AgoraRTM, { RtmChannel, RtmClient, RtmMessage } from "agora-rtm-sdk";
import Toastify from "toastify-js";
import { nanoid } from "nanoid";
import agoraConfig from "./configs/agora.config";
import stunConfig from "./configs/stun.config";
import { MessagePayload } from "./@types/payloads";

import "toastify-js/src/toastify.css";

const myVideoContainer = document.getElementById("me-container") as HTMLDivElement;
const yourVideoContainer = document.getElementById("you-container") as HTMLDivElement;

const myVideo = document.getElementById("me") as HTMLVideoElement;
const yourVideo = document.getElementById("you") as HTMLVideoElement;

const controlCall = document.getElementById("control-call");
const controlVoice = document.getElementById("control-voice");
const controlVideo = document.getElementById("control-video");

let localStream: MediaStream; 
let remoteStream: MediaStream;
let peerConnection: RTCPeerConnection;

let client: RtmClient;
let channel: RtmChannel;

const uid = nanoid(14);

const servers: RTCConfiguration = {
	iceServers: [
		{
			urls: [stunConfig.SERVER_1, stunConfig.SERVER_2],
		},
	],
};

const toast = (message: string) => {
	Toastify({
		text: message,
		gravity: "top",
		position: "center",
	}).showToast();
};

export const createLocalStream = async () => {
	localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
	myVideo.srcObject = localStream;
};

export const createRemoteStream = async () => {
	remoteStream = new MediaStream();
	yourVideo.srcObject = remoteStream;
};

export const createPeerConnection = async (memberId: string) => {
	await createRemoteStream();
	yourVideoContainer.classList.remove("absent");
	myVideoContainer.classList.remove("alone");
	peerConnection = new RTCPeerConnection(servers);

	localStream.getTracks().forEach((track) => {
		peerConnection.addTrack(track, localStream);
	});

	peerConnection.ontrack = (event) => {
		toast("Tracks online...");
		event.streams[0].getTracks().forEach((track) => {
			remoteStream.addTrack(track);
		});
	};
	// peerConnection.onconnectionstatechange = async (ev) => {
	// 	peerConnection = ev.currentTarget as RTCPeerConnection;
	// };

	peerConnection.onicecandidate = async (event) => {
		if (event.candidate) {
			console.log({ icecandidate: event.candidate });
			client.sendMessageToPeer({ text: JSON.stringify({ type: "candidate", candidate: event.candidate }) }, memberId);
		}
	};
};

export const createOffer = async (memberId: string) => {
	if (!localStream) await createLocalStream();
	if (!peerConnection) await createPeerConnection(memberId);

	let offer = await peerConnection.createOffer();
	await peerConnection.setLocalDescription(offer);

	client.sendMessageToPeer({ text: JSON.stringify({ type: "offer", offer }) }, memberId);

	console.log({ offer });
};

export const createAnswer = async (memberId: string, offer: RTCSessionDescriptionInit) => {
	await createPeerConnection(memberId);

	await peerConnection.setRemoteDescription(offer);

	const answer = await peerConnection.createAnswer();
	await peerConnection.setLocalDescription(answer);

	client.sendMessageToPeer({ text: JSON.stringify({ type: "answer", answer }) }, memberId);
};

export const addAnswer = async (answer: RTCSessionDescriptionInit) => {
	if (!peerConnection.currentRemoteDescription) {
		peerConnection.setRemoteDescription(answer);
	}
};

const handleUserJoin = async (memberId: string) => {
	toast("Joined: " + memberId);
	createOffer(memberId);
};
const handleUserLeave = async (memberId: string) => {
	remoteStream = null;
	peerConnection = null;
	yourVideoContainer.classList.add("absent");
	myVideoContainer.classList.add("alone");
	toast("User left.");
};
const handleUserExit = async () => {
	await channel.leave();
	await client.logout();
};
const toggleVideo = async () => {
	const videoTrack = localStream.getTracks().find((track) => track.kind === "video");

	if (videoTrack.enabled) {
		videoTrack.enabled = false;
		if (!controlVideo.classList.contains("disabled")) {
			controlVideo.classList.add("disabled");
		}
	} else {
		videoTrack.enabled = true;
		if (controlVideo.classList.contains("disabled")) {
			controlVideo.classList.remove("disabled");
		}
	}
};

const toggleAudio = async () => {
	const audioTrack = localStream.getTracks().find((track) => track.kind === "audio");

	if (audioTrack.enabled) {
		audioTrack.enabled = false;
		if (!controlVoice.classList.contains("disabled")) {
			controlVoice.classList.add("disabled");
		}
	} else {
		audioTrack.enabled = true;
		if (controlVoice.classList.contains("disabled")) {
			controlVoice.classList.remove("disabled");
		}
	}
};

const handleMessageReceived = async (message: RtmMessage, peerId: string) => {
	if (message.messageType === "TEXT") {
		const peerMessage = JSON.parse(message.text) as MessagePayload;

		switch (peerMessage.type) {
			case "offer":
				createAnswer(peerId, peerMessage.offer);
				break;
			case "candidate":
				console.log({ newIceCandidate: peerMessage.candidate });
				if (peerConnection) {
					peerConnection.addIceCandidate(peerMessage.candidate);
				}
				break;
			case "answer":
				addAnswer(peerMessage.answer);
				break;
			default:
				break;
		}
	}
};

const init = async () => {
	await createLocalStream();

	client = AgoraRTM.createInstance(agoraConfig.APP_ID, { enableLogUpload: false });
	await client.login({ uid, token: agoraConfig.TOKEN });

	channel = client.createChannel("main");
	await channel.join();
	toast("Channel online!");

	channel.on("MemberLeft", handleUserLeave);
	channel.on("MemberJoined", handleUserJoin);
	client.on("MessageFromPeer", handleMessageReceived);
};

window.addEventListener("beforeunload", handleUserExit);
controlVideo.addEventListener("click", toggleVideo);
controlVoice.addEventListener("click", toggleAudio);
controlCall.addEventListener("click", handleUserExit);

init();
