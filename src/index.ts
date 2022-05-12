import dotenv from "dotenv";
dotenv.config();

import AgoraRTM, { RtmChannel, RtmClient, RtmMessage } from "agora-rtm-sdk";
import { nanoid } from "nanoid";
import agoraConfig from "./configs/agora.config";
import stunConfig from "./configs/stun.config";
import { MessagePayload } from "./@types/payloads";

const myVideoContainer = document.getElementById("me-container") as HTMLDivElement;
const yourVideoContainer = document.getElementById("you-container") as HTMLDivElement;

const myVideo = document.getElementById("me") as HTMLVideoElement;
const yourVideo = document.getElementById("you") as HTMLVideoElement;

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

const addClass = (elem: HTMLElement, className: string) => {
	if (!elem.classList.contains(className)) elem.classList.add(className);
};
const removeClass = (elem: HTMLElement, className: string) => {
	if (elem.classList.contains(className)) elem.classList.remove(className);
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
	removeClass(yourVideoContainer, "absent");
	removeClass(myVideoContainer, "alone");
	peerConnection = new RTCPeerConnection(servers);

	localStream.getTracks().forEach((track) => {
		peerConnection.addTrack(track, localStream);
	});

	peerConnection.ontrack = (event) => {
		event.streams[0].getTracks().forEach((track) => {
			remoteStream.addTrack(track);
		});
	};

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
	createOffer(memberId);
};
const handleUserLeave = async (memberId: string) => {
	addClass(yourVideoContainer, "absent");
	addClass(myVideoContainer, "alone");
};
const handleUserExit = async () => {
	channel.leave();
	client.logout();
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

	channel.on("MemberLeft", handleUserLeave);
	channel.on("MemberJoined", handleUserJoin);
	client.on("MessageFromPeer", handleMessageReceived);
};

window.addEventListener("beforeunload", handleUserExit)

init();
