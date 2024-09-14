import {
  FPS,
  explosionDuration,
  INTERPOLATION_DURATION,
  FIRE_COOLDOWN,
  CRYSTAL_RADIUS,
  CRYSTAL_FADE_DURATION,
  gameState,
} from "./gameState.js";
import { drawPlayers } from "./rendering.js";
import {
  showJoinForm,
  showPlayerInfo,
  resizeCanvas,
  togglePlayerList,
  updatePlayerList,
  updateScoreBoard,
  showChangeNameForm,
  submitNewName,
  cancelChangeName,
  showWaitingScreen,
  showGameOver,
  adjustCanvasSize,
  checkOrientation,
} from "./ui.js";
import { startGame } from "./gameLogic.js";
import { addExplosion } from "./utils.js";

// 设置WebSocket协议
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const host = window.location.hostname;
const port = window.location.port || (protocol === "wss:" ? "443" : "80");

// 引入msgpack库
const msgpack = window.msgpack;

// 建立WebSocket连接
const socket = io(`${protocol}//${host}:${port}`, {
  transports: ["websocket", "polling"],
  reconnectionAttempts: 5,
});

// 监听连接错误
socket.on("connect_error", (error) => {
  console.error("连接错误:", error);
});

// 处理服务器pong响应
socket.on("pong", (data) => {
  const end = performance.now();
  const latency = Math.round(end - data.clientTime);
  socket.emit("latency", { latency: latency });
});

socket.on("game_start", () => {
  console.log("Game started");
  document.getElementById("waitingModal").style.display = "none";
  document.getElementById("gameInfo").style.display = "block";
  updatePlayerList(); // 添加这行
});

socket.on("waiting_for_players", () => {
  showWaitingScreen();
});

socket.on("rejoin_game", () => {
  const savedName = localStorage.getItem("playerName");
  if (savedName) {
    socket.emit("player_join", { name: savedName });
  } else {
    showJoinForm();
  }
});

socket.on("game_reset", (data) => {
  gameState.walls = data.walls;
  gameState.maze_info = data.maze_info;
  gameState.players = {};
  gameState.bullets = [];
  gameState.crystals = [];
  gameState.wins = data.wins;
  adjustCanvasSize();
  updateScoreBoard();
  document.getElementById("gameOverModal").style.display = "none";
  document.getElementById("waitingModal").style.display = "none";

  // 重新加入游戏
  const savedName = localStorage.getItem("playerName");
  if (savedName) {
    socket.emit("player_join", { name: savedName });
  }
});

socket.on("player_joined", (data) => {
  gameState.players = data.players;
  gameState.walls = data.walls;
  gameState.maze_info = data.maze_info;
  gameState.wins = data.wins;

  // 只在 gameState.myId 为 null 时设置它
  if (gameState.myId === null) {
    gameState.myId = data.id;
    console.log("gameState.myId set to:", gameState.myId);
  }

  adjustCanvasSize();
  updateScoreBoard();
  if (Object.keys(gameState.players).length > 1) {
    startGame();
  } else {
    showWaitingScreen();
    document.getElementById("currentPlayerCount").textContent = Object.keys(
      gameState.players
    ).length;
  }
  gameState.playerLatencies = data.latencies || {};
  updatePlayerList();
});

socket.on("update_latencies", (latencies) => {
  gameState.playerLatencies = latencies;
  if (gameState.isPlayerListVisible) {
    updatePlayerList();
  }
});

socket.on("player_left", (data) => {
  console.log("Player left:", data.id);

  if (gameState.playerLatencies[data.id]) {
    delete gameState.playerLatencies[data.id];
  }
  if (gameState.players[data.id]) {
    delete gameState.players[data.id];
    console.log("Player removed from local data");
  } else {
    console.log("Player not found in local data");
  }
  updatePlayerList();
  drawPlayers(); // 重新绘制游戏画面
});

socket.on("update_player_count", (data) => {
  const playerCount = document.getElementById("playerCount");
  playerCount.textContent = `在线玩家: ${data.count}`;
  playerCount.title = `在线玩家:\n${data.players.join("\n")}`;
  gameState.playerLatencies = data.latencies || {}; // 更新延迟信息
  if (gameState.isPlayerListVisible) {
    updatePlayerList();
  }
});

socket.on("game_over", (data) => {
  console.log("游戏结束:", data);
  gameState.wins = data.wins;
  updateScoreBoard();

  // 检查是否有正在进行的爆炸动画
  if (gameState.explosions.length > 0) {
    gameState.gameOverPending = true;
    gameState.pendingWinner = data.winner;
  } else {
    showGameOver(data.winner);
  }
});

socket.on("game_state", (binaryData) => {
  try {
    const decodedData = msgpack.decode(new Uint8Array(binaryData));
    gameState.lastGameState = gameState.currentGameState;
    gameState.currentGameState = decodedData;
    gameState.lastUpdateTime = performance.now();
    gameState.interpolationFactor = 0;

    gameState.lasers = gameState.currentGameState.lasers;
    // 移除不再存在的水晶
    gameState.crystals = gameState.crystals.filter((crystal) =>
      gameState.currentGameState.crystals.some(
        (serverCrystal) =>
          serverCrystal.x === crystal.x && serverCrystal.y === crystal.y
      )
    );
  } catch (error) {
    console.error("Error decoding game state:", error);
  }
});

socket.on("crystal_spawned", (data) => {
  console.log("Crystal spawned:", data);
  const newCrystal = {
    x: data.x,
    y: data.y,
    spawnTime: performance.now(),
  };
  gameState.crystals.push(newCrystal);
  console.log("Crystals after spawn:", gameState.crystals);
});

socket.on("crystal_collected", (data) => {
  console.log("Crystal collected:", data);
  gameState.crystals = gameState.crystals.filter(
    (crystal) => crystal.x !== data.x || crystal.y !== data.y
  );
  console.log("Crystals after collection:", gameState.crystals);
});

// 处理玩家被击杀事件
socket.on("player_killed", (data) => {
  console.log("Player killed:", data);
  if (gameState.players[data.id]) {
    gameState.players[data.id].alive = false; // 更新玩家状态！！！
  }
  addExplosion(data.x, data.y);
  if (data.id === gameState.myId) {
    console.log("You were killed!");
    gameState.isMoving = false;
    socket.emit("player_move", { angle: 0, moving: false });
  }
  drawPlayers(); // 重新绘制以更新玩家状态
});

// 处理名字更改事件
socket.on("name_changed", (data) => {
  console.log("Name changed:", data);
  if (data.id === gameState.myId) {
    showPlayerInfo(data.new_name);
  }
  gameState.players[data.id].name = data.new_name;
  gameState.players[data.id].color = data.new_color;
  updateScoreBoard();
});

// 测量延迟函数
function measureLatency() {
  const start = performance.now();
  socket.emit("ping", { clientTime: start }, (serverResponse) => {
    if (serverResponse && serverResponse.serverTime) {
      const end = performance.now();
      const latency = Math.round(end - serverResponse.serverTime);
      socket.emit("latency", { latency: latency });
    }
  });
}

// 页面卸载前断开socket连接,能够清除后台连接的玩家
window.addEventListener("beforeunload", () => {
  socket.disconnect();
});

export { socket, measureLatency };
