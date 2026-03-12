export const State = {
  currentUser: null,
  userData: null,
  activeChatId: null,
  activeChatData: null,
  activeChatUser: null,
  selectedMsgId: null,
  replyingTo: null,
  userCache: {},
  isInitialLoad: true,
  typingTimeout: null,
  callDocId: null,
  callRole: null,
  callType: null,
  startTime: null,
  unsubscribers: {
    chats: null,
    messages: null,
    activeChat: null,
    activeUser: null
  },
  callUnsubs: []
};