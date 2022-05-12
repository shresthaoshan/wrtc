export interface MessagePayload {
	type: "offer" | "candidate" | "answer";
	offer: RTCSessionDescriptionInit;
	candidate: RTCIceCandidate;
	answer: RTCSessionDescriptionInit;
}
