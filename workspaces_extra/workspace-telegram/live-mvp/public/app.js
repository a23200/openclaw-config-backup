const socket = io();

const displayNameInput = document.getElementById('displayName');
const roomIdInput = document.getElementById('roomId');
const roomTitleInput = document.getElementById('roomTitle');
const coverUrlInput = document.getElementById('coverUrl');
const startBroadcastBtn = document.getElementById('startBroadcast');
const joinViewerBtn = document.getElementById('joinViewer');
const leaveRoomBtn = document.getElementById('leaveRoom');
const sendChatBtn = document.getElementById('sendChat');
const chatInputEl = document.getElementById('chatInput');
const chatMessagesEl = document.getElementById('chatMessages');
const statusTextEl = document.getElementById('statusText');
const rolePillEl = document.getElementById('rolePill');
const roomsListEl = document.getElementById('roomsList');
const roomsCountEl = document.getElementById('roomsCount');
const chatCountEl = document.getElementById('chatCount');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const heroRoomIdEl = document.getElementById('heroRoomId');
const heroBroadcasterEl = document.getElementById('heroBroadcaster');
const heroViewerCountEl = document.getElementById('heroViewerCount');
const heroRoomTitleEl = document.getElementById('heroRoomTitle');
const heroRoomLiveStateEl = document.getElementById('heroRoomLiveState');
const heroCoverEl = document.getElementById('heroCover');

let localStream = null;
let currentRoomId = '';
let currentRole = null;
let currentRemoteBroadcasterId = null;
const peerConnections = new Map();
const iceConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function getDisplayName() {
  return displayNameInput.value.trim() || '匿名用户';
}

function getRoomId() {
  return roomIdInput.value.trim();
}

function setStatus(text) {
  statusTextEl.textContent = text;
}

function setRolePill() {
  const labelMap = {
    broadcaster: '主播模式',
    viewer: '观众模式',
  };
  rolePillEl.textContent = labelMap[currentRole] || '未加入';
}

function updateButtonsState() {
  const inRoom = Boolean(currentRoomId);
  startBroadcastBtn.disabled = currentRole === 'broadcaster';
  joinViewerBtn.disabled = currentRole === 'viewer';
  leaveRoomBtn.disabled = !inRoom;
  sendChatBtn.disabled = !inRoom;
  chatInputEl.disabled = !inRoom;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function updateChatCount() {
  const count = chatMessagesEl.querySelectorAll('.chat-message').length;
  chatCountEl.textContent = `${count} 条消息`;
}

function setChatEmpty(text) {
  chatMessagesEl.innerHTML = `<div class="chat-empty">${text}</div>`;
  updateChatCount();
}

function updateHero(room) {
  if (!room) return;
  heroRoomIdEl.textContent = room.roomId || '尚未加入';
  heroBroadcasterEl.textContent = room.broadcasterName || '等待中';
  heroViewerCountEl.textContent = String(room.viewerCount || 0);
  heroRoomTitleEl.textContent = room.title || '还没有房间';
  heroRoomLiveStateEl.textContent = room.live ? '直播中' : '未开播';
  heroRoomLiveStateEl.classList.toggle('is-live', Boolean(room.live));
  heroCoverEl.src = room.cover || 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80';
}

function resetHero() {
  updateHero({
    roomId: '尚未加入',
    broadcasterName: '等待中',
    viewerCount: 0,
    title: '还没有房间',
    live: false,
    cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80',
  });
}

function renderRooms(rooms) {
  roomsCountEl.textContent = `${rooms.length} 个房间`;

  if (!rooms.length) {
    roomsListEl.className = 'rooms-list empty-state';
    roomsListEl.innerHTML = '当前还没有房间，先开一个试试。';
    return;
  }

  roomsListEl.className = 'rooms-list';
  roomsListEl.innerHTML = rooms
    .map((room) => `
      <article class="room-card ${room.live ? 'is-live' : ''}">
        <img src="${room.cover}" alt="${room.title}" class="room-cover" />
        <div class="room-card-body">
          <div class="room-card-top">
            <h3>${room.title}</h3>
            <span class="tiny-pill ${room.live ? 'is-live' : ''}">${room.live ? '直播中' : '待机中'}</span>
          </div>
          <p>${room.broadcasterName} · ${room.viewerCount} 位观众</p>
          <div class="room-card-actions">
            <button class="btn btn-mini btn-secondary" data-room-id="${room.roomId}" data-action="join-viewer">进入观看</button>
            <button class="btn btn-mini btn-ghost" data-room-id="${room.roomId}" data-action="fill-room">填入房间号</button>
          </div>
        </div>
      </article>
    `)
    .join('');
}

function renderMessage(message) {
  const item = document.createElement('div');
  item.className = `chat-message role-${message.role}`;
  item.innerHTML = `
    <div class="chat-message-head">
      <strong>${message.sender}</strong>
      <span>${formatTime(message.createdAt)}</span>
    </div>
    <p>${message.text}</p>
  `;
  chatMessagesEl.appendChild(item);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  updateChatCount();
}

function renderChatHistory(messages) {
  chatMessagesEl.innerHTML = '';
  if (!messages.length) {
    setChatEmpty('还没有消息，来发第一条吧。');
    return;
  }
  messages.forEach(renderMessage);
  updateChatCount();
}

function closeAllPeers() {
  peerConnections.forEach((pc) => pc.close());
  peerConnections.clear();
  currentRemoteBroadcasterId = null;
}

function stopLocalStream() {
  if (!localStream) return;
  localStream.getTracks().forEach((track) => track.stop());
  localStream = null;
  localVideo.srcObject = null;
}

function resetSessionState({ keepInputs = true } = {}) {
  currentRoomId = '';
  currentRole = null;
  currentRemoteBroadcasterId = null;
  closeAllPeers();
  remoteVideo.srcObject = null;
  stopLocalStream();
  setRolePill();
  updateButtonsState();
  setChatEmpty('加入房间后，这里会显示聊天记录。');
  resetHero();
  if (!keepInputs) {
    roomIdInput.value = '';
    roomTitleInput.value = '';
    coverUrlInput.value = '';
  }
}

async function ensureLocalStream() {
  if (localStream) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  localVideo.srcObject = localStream;
  return localStream;
}

function createPeerConnection(peerId, isBroadcaster) {
  if (peerConnections.has(peerId)) return peerConnections.get(peerId);

  const pc = new RTCPeerConnection(iceConfig);

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    socket.emit('webrtc-ice-candidate', {
      targetId: peerId,
      candidate: event.candidate,
    });
  };

  if (isBroadcaster) {
    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }
  } else {
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      remoteVideo.srcObject = stream;
    };
  }

  pc.onconnectionstatechange = () => {
    if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
      peerConnections.delete(peerId);
    }
  };

  peerConnections.set(peerId, pc);
  return pc;
}

async function startBroadcast() {
  const roomId = getRoomId();
  if (!roomId) throw new Error('请先填写房间号');

  await ensureLocalStream();
  currentRoomId = roomId;
  currentRole = 'broadcaster';
  setRolePill();
  updateButtonsState();

  socket.emit('join-as-broadcaster', {
    roomId,
    title: roomTitleInput.value.trim(),
    cover: coverUrlInput.value.trim(),
    displayName: getDisplayName(),
  });

  setStatus(`正在以主播身份进入房间 ${roomId}`);
}

async function joinAsViewer(roomIdOverride = '') {
  const roomId = roomIdOverride || getRoomId();
  if (!roomId) throw new Error('请先填写房间号');

  currentRoomId = roomId;
  currentRole = 'viewer';
  setRolePill();
  updateButtonsState();

  socket.emit('join-as-viewer', {
    roomId,
    displayName: getDisplayName(),
  });

  setStatus(`正在以观众身份进入房间 ${roomId}`);
}

function leaveRoom() {
  if (!currentRoomId) return;
  socket.emit('leave-room');
  setStatus('正在离开房间…');
}

function sendChat() {
  const text = chatInputEl.value.trim();
  if (!currentRoomId || !text) return;

  socket.emit('send-chat-message', {
    roomId: currentRoomId,
    text,
  });
  chatInputEl.value = '';
}

roomsListEl.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-room-id]');
  if (!button) return;

  const roomId = button.dataset.roomId;
  const action = button.dataset.action;
  roomIdInput.value = roomId;

  if (action === 'fill-room') {
    setStatus(`已填入房间号：${roomId}`);
    return;
  }

  if (action === 'join-viewer') {
    joinAsViewer(roomId).catch((error) => {
      console.error(error);
      setStatus(`入房失败：${error.message}`);
    });
  }
});

socket.on('rooms-updated', (rooms) => {
  renderRooms(rooms);
});

socket.on('room-meta', (room) => {
  updateHero(room);
});

socket.on('left-room', () => {
  resetSessionState({ keepInputs: true });
  setStatus('已离开房间');
});

socket.on('chat-history', (messages) => {
  renderChatHistory(messages);
});

socket.on('chat-message', (message) => {
  const empty = chatMessagesEl.querySelector('.chat-empty');
  if (empty) chatMessagesEl.innerHTML = '';
  renderMessage(message);
});

socket.on('room-status', (payload) => {
  if (payload.room) updateHero(payload.room);
  if (payload.role === 'broadcaster') {
    setStatus(`主播已进入房间 ${payload.roomId}，当前观众 ${payload.viewerCount} 人`);
  } else {
    setStatus(payload.hasBroadcaster
      ? `观众已进入房间 ${payload.roomId}，主播在线`
      : `观众已进入房间 ${payload.roomId}，等待主播上线`);
  }
});

socket.on('viewer-joined', async ({ viewerId }) => {
  if (currentRole !== 'broadcaster') return;

  const pc = createPeerConnection(viewerId, true);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('webrtc-offer', { targetId: viewerId, sdp: offer });
  setStatus(`有新观众加入，已向 ${viewerId.slice(0, 6)} 发起推流`);
});

socket.on('broadcaster-ready', ({ broadcasterId, room }) => {
  if (currentRole !== 'viewer') return;
  currentRemoteBroadcasterId = broadcasterId;
  createPeerConnection(broadcasterId, false);
  if (room) updateHero(room);
  setStatus('主播已上线，正在建立连接');
});

socket.on('webrtc-offer', async ({ fromId, sdp }) => {
  const pc = createPeerConnection(fromId, false);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('webrtc-answer', { targetId: fromId, sdp: answer });
  setStatus('已接收主播画面');
});

socket.on('webrtc-answer', async ({ fromId, sdp }) => {
  const pc = peerConnections.get(fromId);
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  setStatus('观众连接完成，正在直播');
});

socket.on('webrtc-ice-candidate', async ({ fromId, candidate }) => {
  const pc = peerConnections.get(fromId) || createPeerConnection(fromId, currentRole === 'broadcaster');
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error('ICE candidate error:', error);
  }
});

socket.on('viewer-left', ({ viewerId }) => {
  const pc = peerConnections.get(viewerId);
  if (pc) {
    pc.close();
    peerConnections.delete(viewerId);
  }
  setStatus(`观众 ${viewerId.slice(0, 6)} 已离开`);
});

socket.on('broadcast-ended', () => {
  remoteVideo.srcObject = null;
  closeAllPeers();
  if (currentRole === 'viewer') {
    currentRole = null;
    currentRoomId = '';
    setRolePill();
    updateButtonsState();
  }
  setStatus('直播已结束');
});

startBroadcastBtn.addEventListener('click', () => {
  startBroadcast().catch((error) => {
    console.error(error);
    setStatus(`开播失败：${error.message}`);
  });
});

joinViewerBtn.addEventListener('click', () => {
  joinAsViewer().catch((error) => {
    console.error(error);
    setStatus(`入房失败：${error.message}`);
  });
});

leaveRoomBtn.addEventListener('click', leaveRoom);
sendChatBtn.addEventListener('click', sendChat);
chatInputEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') sendChat();
});

const savedName = localStorage.getItem('live-mvp-display-name');
if (savedName) displayNameInput.value = savedName;

displayNameInput.addEventListener('change', () => {
  localStorage.setItem('live-mvp-display-name', displayNameInput.value.trim());
});

resetHero();
setRolePill();
updateButtonsState();


(function setupInviteLinks() {
  if (window.__liveMvpInviteSetupDone) return;
  window.__liveMvpInviteSetupDone = true;

  function normalizeRoomId(value) {
    return String(value || '').trim();
  }

  function getRoomInput() {
    return document.getElementById('roomIdInput')
      || document.querySelector('input[name="roomId"]')
      || document.querySelector('input[placeholder*="房间"]');
  }

  function getInviteOutput() {
    return document.getElementById('inviteLinkOutput');
  }

  function getCopyButton() {
    return document.getElementById('copyInviteBtn');
  }

  function buildInviteUrl(roomId) {
    const url = new URL(window.location.href);
    const normalized = normalizeRoomId(roomId);
    if (normalized) {
      url.searchParams.set('room', normalized);
    } else {
      url.searchParams.delete('room');
    }
    url.hash = '';
    return url.toString();
  }

  function refreshInviteUi(roomId) {
    const output = getInviteOutput();
    const copyBtn = getCopyButton();
    const normalized = normalizeRoomId(roomId ?? getRoomInput()?.value);
    const nextValue = normalized ? buildInviteUrl(normalized) : '';

    if (output) {
      output.value = nextValue;
      output.placeholder = normalized
        ? '复制这个链接发给别人'
        : '输入或选择房间后，这里会生成邀请链接';
    }
    if (copyBtn) {
      copyBtn.disabled = !normalized;
      copyBtn.dataset.roomId = normalized;
    }
  }

  function syncRoomToUrl(roomId, { push = false } = {}) {
    const normalized = normalizeRoomId(roomId ?? getRoomInput()?.value);
    const url = new URL(window.location.href);
    if (normalized) {
      url.searchParams.set('room', normalized);
    } else {
      url.searchParams.delete('room');
    }
    const method = push ? 'pushState' : 'replaceState';
    window.history[method]({}, '', url);
    refreshInviteUi(normalized);
  }

  function hydrateRoomFromUrl() {
    const roomFromUrl = normalizeRoomId(new URL(window.location.href).searchParams.get('room'));
    const roomInput = getRoomInput();
    if (roomFromUrl && roomInput && !normalizeRoomId(roomInput.value)) {
      roomInput.value = roomFromUrl;
      roomInput.dispatchEvent(new Event('input', { bubbles: true }));
      roomInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    refreshInviteUi(roomFromUrl || roomInput?.value);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const roomInput = getRoomInput();
    const copyBtn = getCopyButton();

    hydrateRoomFromUrl();

    if (roomInput) {
      ['input', 'change', 'blur'].forEach((eventName) => {
        roomInput.addEventListener(eventName, () => {
          syncRoomToUrl(roomInput.value);
        });
      });
    }

    ['createRoomForm', 'joinRoomForm'].forEach((formId) => {
      const form = document.getElementById(formId);
      if (form) {
        form.addEventListener('submit', () => {
          const currentRoom = roomInput?.value;
          window.setTimeout(() => syncRoomToUrl(currentRoom, { push: true }), 0);
        });
      }
    });

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const roomId = copyBtn.dataset.roomId || roomInput?.value;
        const inviteUrl = buildInviteUrl(roomId);
        try {
          await navigator.clipboard.writeText(inviteUrl);
          const originalText = copyBtn.textContent;
          copyBtn.textContent = '已复制';
          window.setTimeout(() => {
            copyBtn.textContent = originalText;
          }, 1400);
        } catch (error) {
          const output = getInviteOutput();
          if (output) {
            output.focus();
            output.select();
          }
        }
      });
    }

    document.addEventListener('click', (event) => {
      const roomTrigger = event.target.closest('[data-room-id]');
      if (!roomTrigger || !roomInput) return;
      const clickedRoomId = normalizeRoomId(roomTrigger.dataset.roomId);
      if (!clickedRoomId) return;
      window.setTimeout(() => {
        roomInput.value = clickedRoomId;
        syncRoomToUrl(clickedRoomId);
      }, 0);
    });

    window.addEventListener('popstate', hydrateRoomFromUrl);
  });
})();
