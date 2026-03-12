export const CallsModule = {
  // v4.1 foundation only.
  // Existing call system can be moved here in next patch.
  startCall(type) {
    console.log("Start call:", type);
  },
  acceptCall() {
    console.log("Accept call");
  },
  endCall() {
    console.log("End call");
  }
};