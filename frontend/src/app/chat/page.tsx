"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { socket } from "../../lib/socketClient";
import { useChatStore } from "../../store/chatStore";
import { v4 as uuidv4 } from "uuid";
import styles from "./page.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const personalInfoPattern = /(address|home|school|workplace|phone|telephone|email|password|login|credit card|bank|money|location|where do you live|full name|real name|social media|instagram|snapchat|whatsapp|meet in person)/i;
const MAX_IMAGE_BYTES = 500 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
type User = {
  id: string;
  username: string;
  email: string;
  interests: string[];
  languagePref: string;
  isProfilePublic: boolean;
  isOnline: boolean;
};
const request = async (path: string, options: RequestInit = {}) => {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("ghostchat_token")
      : null;
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
};

export default function ChatPage() {
  const {
    roomId,
    messages,
    isSearching,
    setRoomId,
    addMessage,
    setIsSearching,
    clearChat,
  } = useChatStore();
  const activeQueueId = useRef<string | null>(null);
  const activeRoomId = useRef<string | null>(roomId);
  const searchingRef = useRef(false);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [isAiRoom, setIsAiRoom] = useState(false);
  const [online, setOnline] = useState(0);
  const [input, setInput] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [authForm, setAuthForm] = useState({
    email: "",
    username: "",
    password: "",
  });
  const [interests, setInterests] = useState("coding, music");
  const [language, setLanguage] = useState("en");
  const [publicProfile, setPublicProfile] = useState(true);
  const [friends, setFriends] = useState<User[]>([]);
  const [friendRequests, setFriendRequests] = useState<any[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({ username: '', email: '' });
  const [notice, setNotice] = useState("");
  const [aiTyping, setAiTyping] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [crisisNotice, setCrisisNotice] = useState(false);
  // Concepts borrowed from popular chat apps: tabbed navigation, quick reactions,
  // an emoji tray, tap-to-open shared media, and a live "seen" style receipt.
  const [activeTab, setActiveTab] = useState<"chats" | "friends" | "requests">("chats");
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [openImage, setOpenImage] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const quickReactions = ["👍", "❤️", "😂", "😮", "😢"];
  const emojis = ["🙂", "😄", "😂", "😍", "🤔", "😴", "🙌", "👏", "🔥", "✨", "🎧", "🎮", "🍕", "☕", "🌈", "💬"];
  const galleryImages = ["/media/moodboard-1.svg", "/media/moodboard-2.svg", "/media/moodboard-3.svg"];
  const reactToMessage = (id: string, emoji: string) =>
    setReactions((prev) => {
      const next = { ...prev };
      if (next[id] === emoji) delete next[id];
      else next[id] = emoji;
      return next;
    });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("guest") === "1") {
      const guestUser = { id: `guest-${uuidv4()}`, username: "Guest", email: "", interests: ["coding"], languagePref: "en", isProfilePublic: false, isOnline: true };
      setUser(guestUser);
      setInterests("coding, music");
      setLanguage("en");
      setPublicProfile(false);
      window.history.replaceState({}, "", "/chat");
      return;
    }
    const token = localStorage.getItem("ghostchat_token");
    if (token)
      request("/api/me")
        .then(({ user: nextUser }) => {
          setUser(nextUser);
          setProfileForm({ username: nextUser.username, email: nextUser.email });
          setInterests(nextUser.interests.join(", "));
          setLanguage(nextUser.languagePref);
          setPublicProfile(nextUser.isProfilePublic);
        })
        .catch(() => localStorage.clear());
  }, []);
  useEffect(() => {
    request("/api/online-count")
      .then((data) => setOnline(data.count))
      .catch(() => undefined);
  }, [user]);
  useEffect(() => {
    if (!user) return;
    socket.auth = { userId: user.id };
    socket.connect();
    const recoverDisconnectedChat = () => {
      if (!activeRoomId.current && !searchingRef.current) return;
      activeQueueId.current = null;
      activeRoomId.current = null;
      searchingRef.current = false;
      setRoomId(null);
      setPeerId(null);
      setIsAiRoom(false);
      setIsSearching(false);
      setAiTyping(false);
      setPeerTyping(false);
      setAiSuggestions([]);
      setCrisisNotice(false);
      clearChat();
      setNotice("Connection lost. Start a new conversation.");
    };
    const handleDisconnect = (reason: string) => {
      if (reason !== "io client disconnect") recoverDisconnectedChat();
    };
    socket.on("match_found", (data) => {
      if (!searchingRef.current || data.queueId !== activeQueueId.current) return;
      searchingRef.current = false;
      activeQueueId.current = null;
      activeRoomId.current = data.roomId;
      setRoomId(data.roomId);
      setPeerId(data.peerId);
      setIsAiRoom(Boolean(data.isAI));
      setIsSearching(false);
      setAiSuggestions([]);
      setCrisisNotice(false);
      setAiTyping(Boolean(data.isAI));
      // Ask the companion for its opening line now that the room is actually open.
      if (data.isAI) {
        socket.emit("ai_room_ready", {
          roomId: data.roomId,
          interests: interests.split(",").map((item) => item.trim()).filter(Boolean),
          language,
        });
      }
    });
    socket.on("receive_message", (data) => {
      if (data.roomId === activeRoomId.current) addMessage(data);
    });
    socket.on("ai_typing", (data) => {
      if (data.roomId === activeRoomId.current) setAiTyping(!data.done);
    });
    socket.on("ai_suggestions", (data) => {
      if (data.roomId === activeRoomId.current) setAiSuggestions(data.suggestions || []);
    });
    socket.on("ai_boundary", (data) => {
      if (data.roomId === activeRoomId.current) setNotice(data.reason);
    });
    socket.on("ai_crisis", (data) => {
      if (data.roomId === activeRoomId.current) setCrisisNotice(true);
    });
    socket.on("message_blocked", (data) => setNotice(data.reason));
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", recoverDisconnectedChat);
    return () => {
      socket.off("match_found");
      socket.off("receive_message");
      socket.off("ai_typing");
      socket.off("ai_suggestions");
      socket.off("ai_boundary");
      socket.off("ai_crisis");
      socket.off("message_blocked");
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", recoverDisconnectedChat);
      socket.disconnect();
    };
  }, [user, addMessage, setIsSearching, setRoomId, clearChat, interests, language]);

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setNotice("");
    try {
      const data = await request(`/api/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify(authForm),
      });
      localStorage.setItem("ghostchat_token", data.token);
      localStorage.setItem("ghostchat_user_id", data.user.id);
      setUser(data.user);
      setProfileForm({ username: data.user.username, email: data.user.email });
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to sign in");
    }
  };
  const savePreferences = async () => {
    try {
      const data = await request("/api/me/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          interests: interests
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          languagePref: language,
          isProfilePublic: publicProfile,
        }),
      });
      setUser(data.user);
      setNotice("Preferences saved");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to save");
    }
  };
  const saveProfile = async () => {
    try {
      const profileData = await request('/api/me/profile', { method: 'PATCH', body: JSON.stringify(profileForm) });
      const preferenceData = await request('/api/me/preferences', { method: 'PATCH', body: JSON.stringify({ interests: interests.split(',').map(item => item.trim()).filter(Boolean), languagePref: language, isProfilePublic: publicProfile }) });
      const nextUser = { ...profileData.user, ...preferenceData.user };
      setUser(nextUser);
      setProfileForm({ username: nextUser.username, email: nextUser.email });
      setProfileEditing(false);
      setNotice('Profile updated');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to update profile');
    }
  };
  const findStranger = () => {
    setNotice("");
    const queueId = uuidv4();
    activeQueueId.current = queueId;
    activeRoomId.current = null;
    searchingRef.current = true;
    setIsSearching(true);
    setAiSuggestions([]);
    setCrisisNotice(false);
    setAiTyping(false);
    clearChat();
    socket.emit("join_queue", {
      queueId,
      interests: interests.split(",").map((item) => item.trim()),
      language,
    });
  };
  const cancelSearch = () => {
    activeQueueId.current = null;
    searchingRef.current = false;
    socket.emit("leave_queue");
    setIsSearching(false);
    setNotice("Search cancelled");
  };
  const endConversation = () => {
    activeQueueId.current = null;
    activeRoomId.current = null;
    searchingRef.current = false;
    socket.disconnect();
    setPeerId(null);
    setIsAiRoom(false);
    setAiTyping(false);
    setAiSuggestions([]);
    setCrisisNotice(false);
    clearChat();
    if (user) {
      socket.auth = { userId: user.id };
      socket.connect();
    }
    setNotice("Conversation ended");
  };
  const sendMessage = () => {
    if (!input.trim() || !roomId || (isAiRoom && aiTyping)) return;
    setSeen(false);
    setTimeout(() => setSeen(true), 1100);
        if (isAiRoom) {
          setAiTyping(true);
          setAiSuggestions([]);
        }
    // The companion enforces its own limits and explains them in character, so in
    // AI rooms we let the server answer instead of blocking locally with a banner.
    if (!isAiRoom && personalInfoPattern.test(input)) {
      setNotice("Please keep personal information out of chat.");
      setInput("");
      return;
    }
    const msg = {
      id: uuidv4(),
      senderId: "me",
      content: input,
      timestamp: Date.now(),
      roomId,
    };
    socket.emit("send_message", {
      ...msg,
      interests: interests.split(",").map((item) => item.trim()).filter(Boolean),
      language,
    });
    addMessage(msg);
    setInput("");
    setEmojiOpen(false);
    if (!isAiRoom) {
      setPeerTyping(true);
      setTimeout(() => setPeerTyping(false), 2400);
    }
    if (isAiRoom) setAiSuggestions([]);
  };
  const sendImage = (file: File) => {
    if (isAiRoom) {
      setNotice("Image sharing is available in chats with another person, not AI chats.");
      return;
    }
    if (!roomId) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setNotice("Choose a PNG, JPEG, WebP, or GIF image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setNotice("Images must be 500 KB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setNotice("Unable to read that image.");
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setNotice("Unable to read that image.");
        return;
      }

      const message = {
        id: uuidv4(),
        senderId: "me",
        content: "Shared an image",
        imageData: reader.result,
        timestamp: Date.now(),
        roomId,
      };
      socket.emit("send_message", message);
      addMessage(message);
      setNotice("");
    };
    reader.readAsDataURL(file);
  };
  const loadFriends = async () => {
    try {
      const [friendData, requestData] = await Promise.all([
        request("/api/friends"),
        request("/api/friends/requests"),
      ]);
      setFriends(friendData.friends);
      setFriendRequests(requestData.requests);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to load friends",
      );
    }
  };
  const sendFriendRequest = async () => {
    if (!peerId) return;
    try {
      await request("/api/friends/request", {
        method: "POST",
        body: JSON.stringify({ userId: peerId }),
      });
      setNotice("Friend request sent");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to send request",
      );
    }
  };
  const acceptFriendRequest = async (id: string) => {
    try {
      await request(`/api/friends/requests/${id}/accept`, { method: "POST" });
      await loadFriends();
      setNotice("Friend request accepted");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to accept request",
      );
    }
  };
  const signOut = () => {
    socket.disconnect();
    localStorage.clear();
    setUser(null);
    clearChat();
  };

  if (!user)
    return (
      <main className={styles.page}>
        <section className={styles.authCard}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>/</span> Stranger Chat
          </div>
          <p className={styles.eyebrow}>A better way to meet a stranger</p>
          <h1>
            {authMode === "register"
              ? "Make room for someone new."
              : "Welcome back, stranger."}
          </h1>
          <form onSubmit={submitAuth} className={styles.authForm}>
            <input
              aria-label="Email"
              placeholder="Email"
              type="email"
              required
              value={authForm.email}
              onChange={(e) =>
                setAuthForm({ ...authForm, email: e.target.value })
              }
            />
            {authMode === "register" && (
              <input
                aria-label="Username"
                placeholder="Anonymous username"
                required
                value={authForm.username}
                onChange={(e) =>
                  setAuthForm({ ...authForm, username: e.target.value })
                }
              />
            )}
            <input
              aria-label="Password"
              placeholder="Password (6+ characters)"
              type="password"
              required
              value={authForm.password}
              onChange={(e) =>
                setAuthForm({ ...authForm, password: e.target.value })
              }
            />
            <button className={styles.primaryButton}>
              {authMode === "register" ? "Create account ->" : "Log in ->"}
            </button>
          </form>
          {notice && <p className={styles.notice}>{notice}</p>}
          <button
            className={styles.textButton}
            onClick={() =>
              setAuthMode(authMode === "register" ? "login" : "register")
            }
          >
            {authMode === "register"
              ? "Already have an account? Log in"
              : "New here? Create an account"}
          </button>
          <a className={styles.guestButton} href="/chat?guest=1">Continue anonymously <span>-&gt;</span></a>
        </section>
      </main>
    );

  return (
    <main className={styles.page}>
      <div className={styles.gridGlow} aria-hidden="true" />
      <section className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>/</span> Stranger Chat
          </div>
          <div className={styles.status}>
            <span /> {online} online
          </div>
        </header>
        <div className={styles.appLayout}>
          <aside className={styles.sidebar}>
            <button
              className={styles.profile}
              onClick={() => { setProfileForm({ username: user.username, email: user.email }); setProfileEditing(false); setProfileOpen(true); }}
              aria-label="Open profile"
            >
              <span className={styles.avatar}>
                {user.username[0].toUpperCase()}
              </span>
              <span>
                <strong>{user.username}</strong>
                <small>
                  {user.isProfilePublic ? "Public profile" : "Private profile"}
                </small>
              </span>
              <span className={styles.profileArrow}>-&gt;</span>
            </button>
            <div className={styles.searchBar}>
              <span className={styles.searchIcon}>⌕</span>
              <input placeholder="Search conversations" aria-label="Search conversations" />
            </div>
            <div className={styles.tabs} role="tablist">
              <button
                role="tab"
                aria-selected={activeTab === "chats"}
                className={`${styles.tab} ${activeTab === "chats" ? styles.tabActive : ""}`}
                onClick={() => setActiveTab("chats")}
              >
                Chats
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "friends"}
                className={`${styles.tab} ${activeTab === "friends" ? styles.tabActive : ""}`}
                onClick={() => { setActiveTab("friends"); loadFriends(); }}
              >
                Friends <em>{friends.length}</em>
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "requests"}
                className={`${styles.tab} ${activeTab === "requests" ? styles.tabActive : ""}`}
                onClick={() => { setActiveTab("requests"); loadFriends(); }}
              >
                Requests {friendRequests.length > 0 && <em className={styles.badge}>{friendRequests.length}</em>}
              </button>
            </div>
            <nav className={styles.nav}>
              {activeTab === "chats" && (
                <>
                  <button className={styles.activeNav} onClick={() => setNotice("Start a new conversation from the room on the right.")}>
                    <span className={styles.chatAvatar}>+</span>
                    <span className={styles.chatMeta}>
                      <strong>New conversation</strong>
                      <small>Find a stranger by interest</small>
                    </span>
                  </button>
                  {roomId && (
                    <button className={`${styles.chatRow} ${styles.pinnedChat}`}>
                      <span className={styles.chatAvatar}>★</span>
                      <span className={styles.chatMeta}>
                        <strong>{isAiRoom ? "AI companion" : "Private room"}</strong>
                        <small>Pinned · #{roomId.slice(-6)}</small>
                      </span>
                    </button>
                  )}
                  {peerId && (
                    <div className={styles.chatRow}>
                      <span className={styles.chatAvatar}>•••</span>
                      <span className={styles.chatMeta}>
                        <strong>Current chat</strong>
                        <small>{isAiRoom ? "Always here" : "Typing…"}</small>
                      </span>
                      <span className={styles.unread}>1</span>
                    </div>
                  )}
                </>
              )}
              {activeTab === "friends" &&
                (friends.length === 0 ? (
                  <p className={styles.emptyTab}>No friends yet. Add someone after a great chat.</p>
                ) : (
                  friends.map((friend) => (
                    <div key={friend.id} className={styles.chatRow}>
                      <span className={styles.friendAvatar}>{friend.username[0]?.toUpperCase()}</span>
                      <span className={styles.chatMeta}>
                        <strong>{friend.username}</strong>
                        <small>{friend.isOnline ? "Online now" : "Offline"}</small>
                      </span>
                      <span className={`${styles.presenceDot} ${friend.isOnline ? styles.presenceOn : styles.presenceOff}`} />
                    </div>
                  ))
                ))}
              {activeTab === "requests" &&
                (friendRequests.length === 0 ? (
                  <p className={styles.emptyTab}>No pending friend requests.</p>
                ) : (
                  friendRequests.map((item) => (
                    <button
                      key={item.id}
                      className={styles.requestButton}
                      onClick={() => acceptFriendRequest(item.id)}
                    >
                      Accept {item.requester.username}
                    </button>
                  ))
                ))}
              <button className={styles.sideButton} onClick={signOut}>
                <b>↪</b> Sign out
              </button>
            </nav>
            <div className={styles.sidebarFooter}>
              <span className={styles.helpIcon}>?</span>
              <span>
                Keep it kind.
                <br />
                Keep it curious.
              </span>
            </div>
          </aside>
          <div className={styles.workspace}>
            <div className={styles.workspaceHeading}>
              <div>
                <p className={styles.eyebrow}>Conversation space</p>
                <h1>
                  {roomId
                    ? "You found someone."
                    : "Find your next conversation."}
                </h1>
              </div>
              <span className={styles.encrypted}>Online now: {online}</span>
            </div>
            {!roomId ? (
              <>
                <div className={styles.summaryStrip}>
                  <div className={styles.summaryCard}>
                    <span>Private</span>
                    <strong>Anonymous rooms</strong>
                  </div>
                  <div className={styles.summaryCard}>
                    <span>Match</span>
                    <strong>By shared vibe</strong>
                  </div>
                  <div className={styles.summaryCard}>
                    <span>Flow</span>
                    <strong>Fast replies</strong>
                  </div>
                </div>
                <div className={styles.preferences}>
                  <label>
                    Interests
                    <input
                      value={interests}
                      onChange={(e) => setInterests(e.target.value)}
                    />
                  </label>
                  <label>
                    Language
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="hi">Hindi</option>
                    </select>
                  </label>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={publicProfile}
                      onChange={(e) => setPublicProfile(e.target.checked)}
                    />{" "}
                    Profile visible
                  </label>
                  <button
                    className={styles.saveButton}
                    onClick={savePreferences}
                  >
                    Save
                  </button>
                </div>
                <div
                  className={`${styles.waitingCard} ${isSearching ? styles.searching : ""}`}
                >
                  <div className={styles.radar}>
                    <span />
                    <i />
                    <b />
                  </div>
                  <div className={styles.waitingCopy}>
                    <span className={styles.cardLabel}>
                      {isSearching ? "Scanning the room" : "Ready when you are"}
                    </span>
                    <p>
                      {isSearching
                        ? "Looking for a shared interest and language."
                        : "No profile pressure. Just a fresh conversation."}
                    </p>
                  </div>
                  <button
                    onClick={isSearching ? cancelSearch : findStranger}
                    className={styles.primaryButton}
                  >
                    {isSearching ? "Cancel search" : "Find a stranger"}{" "}
                    <span>-&gt;</span>
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.chatCard}>
                <div className={styles.chatTopline}>
                  <span className={styles.chatHeaderAvatar}>
                    {isAiRoom ? "AI" : peerId ? peerId[0].toUpperCase() : "?"}
                  </span>
                  <span className={styles.chatHeaderName}>
                    <strong>{isAiRoom ? "AI companion" : "Private room"}</strong>
                    <small>
                      <span className={styles.connectedDot} />
                      {isAiRoom ? "Always here" : "Online"}
                      <span className={styles.roomCode}>#{roomId.slice(-6)}</span>
                    </small>
                  </span>
                  <span className={styles.headerActions}>
                    <button
                      className={styles.iconButton}
                      aria-label="Voice call"
                      title="Voice calls are not available yet"
                      onClick={() => setNotice("Voice calls are not available yet. You can continue by text.")}
                    >📞</button>
                    <button
                      className={styles.iconButton}
                      aria-label="Video call"
                      title="Video calls are not available yet"
                      onClick={() => setNotice("Video calls are not available yet. You can continue by text.")}
                    >🎥</button>
                    <button className={styles.endButton} onClick={endConversation}>
                      End
                    </button>
                  </span>
                </div>
                <div className={styles.messages}>
                  <div className={styles.welcomeNote}>
                    {isAiRoom
                      ? "You're with a companion that listens. Share what's on your mind."
                      : "You are both here. Say hello."}
                  </div>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`${styles.messageRow} ${message.senderId === "me" ? styles.rowMine : styles.rowTheirs}`}
                    >
                      <div className={styles.messageStack}>
                        <div className={`${styles.message} ${message.senderId === "me" ? styles.mine : styles.theirs}`}>
                          {message.imageData ? (
                            <img className={styles.sharedImage} src={message.imageData} alt="Image shared in chat" />
                          ) : message.content}
                          {message.senderId === "me" && (
                            <span className={`${styles.ticks} ${seen ? styles.ticksSeen : ""}`}>
                              {seen ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>
                        <div className={styles.reactionBar}>
                          {quickReactions.map((emoji) => (
                            <button key={emoji} className={styles.reactionOption} onClick={() => reactToMessage(message.id, emoji)}>
                              {emoji}
                            </button>
                          ))}
                        </div>
                        {reactions[message.id] && <span className={styles.reactionBadge}>{reactions[message.id]}</span>}
                      </div>
                    </div>
                  ))}
                  {!isAiRoom && peerTyping && (
                    <div className={`${styles.message} ${styles.theirs} ${styles.typing}`}>
                      <span />
                    </div>
                  )}
                  {isAiRoom && aiTyping && (
                    <div className={`${styles.message} ${styles.theirs} ${styles.typing}`} aria-label="AI is typing">
                      <span />
                      <span />
                      <span />
                    </div>
                  )}
                </div>
                {isAiRoom && aiSuggestions.length > 0 && (
                  <div className={styles.suggestions}>
                    {aiSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        className={styles.suggestionButton}
                        onClick={() => setInput(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
                {isAiRoom && crisisNotice && (
                  <p className={styles.crisisNotice}>
                    <strong>Please reach out to a real person.</strong> If you are in
                    danger or thinking about harming yourself, contact your local
                    emergency number or a crisis helpline right now. This chat cannot
                    keep you safe - people can.
                  </p>
                )}
                <div className={styles.composer}>
                  <button
                    className={`${styles.iconButton} ${emojiOpen ? styles.iconButtonActive : ""}`}
                    onClick={() => setEmojiOpen((open) => !open)}
                    aria-label="Open emoji tray"
                    aria-expanded={emojiOpen}
                  >
                    😊
                  </button>
                  <button
                    className={styles.iconButton}
                    aria-label="Attach image"
                    title={isAiRoom ? "Image sharing is only available in human chats" : "Attach an image"}
                    onClick={() => {
                      if (isAiRoom) setNotice("Image sharing is available in chats with another person, not AI chats.");
                      else attachmentInput.current?.click();
                    }}
                  >📎</button>
                  <input
                    ref={attachmentInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    hidden
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (file) sendImage(file);
                    }}
                  />
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendMessage();
                    }}
                    className={styles.input}
                    placeholder="Write something honest..."
                    aria-label="Message"
                  />
                  <button
                    onClick={sendMessage}
                    className={styles.sendButton}
                    aria-label="Send message"
                    disabled={isAiRoom && aiTyping}
                  >
                                    {isAiRoom && <p className={styles.aiNotice}>Honest limits: I am an AI, not a person. No personal details, contact info, money, private images, meeting up, romance, or medical/legal/financial advice. If model mode is enabled, recent chat turns are processed by the configured AI provider, so avoid sensitive details.</p>}
                    -&gt;
                  </button>
                </div>
                <div className={styles.gallery}>
                  {galleryImages.map((src) => (
                    <button
                      key={src}
                      className={styles.galleryThumb}
                      onClick={() => setOpenImage(src)}
                      aria-label="Open shared image"
                    >
                      <img src={src} alt="Shared moodboard" />
                    </button>
                  ))}
                </div>
                {emojiOpen && (
                  <div className={styles.emojiTray}>
                    {emojis.map((emoji) => (
                      <button
                        key={emoji}
                        className={styles.emojiOption}
                        onClick={() => { setInput((value) => value + emoji); setEmojiOpen(false); }}
                        aria-label={`Insert ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
                {isAiRoom && <p className={styles.aiNotice}>Honest limits: I am an AI, not a person. No personal details, contact info, money, private images, meeting up, romance, or medical/legal/financial advice. Everything else is fair game, feelings included.</p>}
                <div className={styles.moderation}>
                  {!isAiRoom && <button onClick={sendFriendRequest}>Add friend</button>}
                  <button
                    onClick={async () => {
                      if (peerId) {
                        await request("/api/moderation/block", {
                          method: "POST",
                          body: JSON.stringify({ userId: peerId }),
                        });
                        endConversation();
                        setNotice("Stranger blocked");
                      }
                    }}
                  >
                    Block
                  </button>
                  <button
                    onClick={async () => {
                      if (peerId) {
                        await request("/api/moderation/report", {
                          method: "POST",
                          body: JSON.stringify({
                            userId: peerId,
                            reason: "Inappropriate behavior",
                          }),
                        });
                        setNotice("Report submitted");
                      }
                    }}
                  >
                    Report
                  </button>
                </div>
              </div>
            )}
            {notice && <p className={styles.notice}>{notice}</p>}
          </div>
        </div>
      </section>
      {profileOpen && (
        <div
          className={styles.profileBackdrop}
          role="presentation"
          onClick={() => setProfileOpen(false)}
        >
          <section
            className={styles.profilePanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className={styles.closeProfile}
              onClick={() => setProfileOpen(false)}
              aria-label="Close profile"
            >
              x
            </button>
            <div className={styles.profileHero}>
              <span className={styles.profileAvatar}>
                {user.username[0].toUpperCase()}
              </span>
              <span className={styles.onlineBadge} /> <p>Profile details</p>
            </div>
            {profileEditing ? (
              <div className={styles.profileEditForm}>
                <h2 id="profile-title">Edit profile</h2>
                <label>Username<input value={profileForm.username} onChange={event => setProfileForm({ ...profileForm, username: event.target.value })} /></label>
                <label>Email<input type="email" value={profileForm.email} onChange={event => setProfileForm({ ...profileForm, email: event.target.value })} /></label>
                <label>Interests<input value={interests} onChange={event => setInterests(event.target.value)} placeholder="coding, music" /></label>
                <label>Language<select value={language} onChange={event => setLanguage(event.target.value)}><option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option><option value="hi">Hindi</option></select></label>
                <label className={styles.profileToggle}><input type="checkbox" checked={publicProfile} onChange={event => setPublicProfile(event.target.checked)} /> Show my profile to friends</label>
                <div className={styles.profileActions}><button className={styles.textButton} onClick={() => setProfileEditing(false)}>Cancel</button><button className={styles.primaryButton} onClick={saveProfile}>Save changes <span>-&gt;</span></button></div>
              </div>
            ) : (
              <>
                <h2 id="profile-title">{user.username}</h2>
                <p className={styles.profileEmail}>{user.email}</p>
                <div className={styles.profileRows}>
                  <div><span>Language</span><strong>{language.toUpperCase()}</strong></div>
                  <div><span>Interests</span><strong>{interests || "No interests added"}</strong></div>
                  <div><span>Visibility</span><strong>{publicProfile ? "Visible to friends" : "Private"}</strong></div>
                  <div><span>Status</span><strong>Online</strong></div>
                </div>
                <button className={styles.primaryButton} onClick={() => setProfileEditing(true)}>Edit profile <span>-&gt;</span></button>
              </>
            )}
          </section>
        </div>
      )}
      {openImage && (
        <div
          className={styles.lightbox}
          role="presentation"
          onClick={() => setOpenImage(null)}
        >
          <button
            className={styles.lightboxClose}
            onClick={() => setOpenImage(null)}
            aria-label="Close image"
          >
            x
          </button>
          <img
            className={styles.lightboxImage}
            src={openImage}
            alt="Shared media"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}
