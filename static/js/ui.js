import { gameState } from "./gameState.js";
import { socket } from "./socket.js";
import { logElementState } from "./utils.js";

// 显示加入游戏表单
function showJoinForm() {
  console.log("Showing join form");
  const joinForm = document.getElementById("joinForm");
  const gameInfo = document.getElementById("gameInfo");
  const gameArea = document.getElementById("gameArea");
  const waitingModal = document.getElementById("waitingModal");

  if (joinForm) joinForm.style.display = "block";
  if (gameInfo) gameInfo.style.display = "none";
  if (gameArea) gameArea.style.display = "none";
  if (waitingModal) waitingModal.style.display = "none";

  gameState.gameState = "not_joined";

  // 添加这些调试日志
  logElementState("joinForm");
  logElementState("playerName");
  logElementState("joinButton");
}

function showPlayerInfo(name) {
  const playerNameDisplay = document.getElementById("playerNameDisplay");
  if (playerNameDisplay) {
    playerNameDisplay.textContent = name;
  } else {
    console.error("Player name display element not found");
  }
}

// 调整画布大小
function resizeCanvas() {
  if (
    gameState.maze_info &&
    gameState.maze_info.width &&
    gameState.maze_info.height
  ) {
    const scale = Math.min(
      window.innerWidth / gameState.maze_info.width,
      window.innerHeight / gameState.maze_info.height
    );
    gameState.gameArea.setAttribute("width", gameState.maze_info.width * scale);
    gameState.gameArea.setAttribute(
      "height",
      gameState.maze_info.height * scale
    );
  }
}

// 切换玩家列表显示
function togglePlayerList() {
  gameState.isPlayerListVisible = !gameState.isPlayerListVisible;
  const playerList = document.getElementById("playerList");
  playerList.style.display = gameState.isPlayerListVisible ? "block" : "none";
  if (gameState.isPlayerListVisible) {
    updatePlayerList();
  }
}

// 更新玩家列表
function updatePlayerList() {
  const playerList = document.getElementById("playerList");
  let listHtml = "<h3>在线玩家</h3>";
  for (let id in gameState.players) {
    const latency =
      gameState.playerLatencies[id] !== undefined
        ? gameState.playerLatencies[id]
        : "未知";
    listHtml += `<p>${gameState.players[id].name}: ${latency}ms</p>`;
  }
  playerList.innerHTML = listHtml;
}

function updateScoreBoard() {
  const scoreBoard = document.getElementById("scoreBoard");
  if (scoreBoard) {
    let scoreHtml = "<h3>胜利榜</h3>";
    let sortedPlayers = Object.entries(gameState.wins).sort(
      (a, b) => b[1] - a[1]
    );
    for (let [id, winCount] of sortedPlayers) {
      if (gameState.players[id]) {
        scoreHtml += `<p>${gameState.players[id].name}: ${winCount}胜</p>`;
      }
    }
    scoreBoard.innerHTML = scoreHtml;
  } else {
    console.error("Score board element not found");
  }
}

// 显示更改名字表单
function showChangeNameForm() {
  console.log("Showing change name form");
  document.getElementById("gameInfo").style.display = "none";
  document.getElementById("changeNameForm").style.display = "block";
  document.getElementById("newPlayerName").value = "";
  document.getElementById("newPlayerName").focus();
}

// 提交新名字
function submitNewName() {
  const newName = document.getElementById("newPlayerName").value.trim();
  if (newName) {
    console.log("Submitting new name:", newName);
    localStorage.setItem("playerName", newName);
    socket.emit("change_name", { name: newName });
    showPlayerInfo(newName);
    document.getElementById("changeNameForm").style.display = "none";
    document.getElementById("gameInfo").style.display = "flex";
  } else {
    alert("请输入有效的名字");
  }
}

// 取消更改名字
function cancelChangeName() {
  console.log("Cancelling name change");
  document.getElementById("changeNameForm").style.display = "none";
  document.getElementById("gameInfo").style.display = "flex";
}

function showWaitingScreen() {
  document.getElementById("joinForm").style.display = "none";
  document.getElementById("gameInfo").style.display = "flex";
  document.getElementById("gameArea").style.display = "none";
  document.getElementById("waitingModal").style.display = "block";
  gameState.gameState = "waiting";
}

// 显示游戏结束界面
function showGameOver(winner) {
  const gameOverModal = document.getElementById("gameOverModal");
  const winnerNameElement = document.getElementById("winnerName");

  if (winnerNameElement) {
    winnerNameElement.textContent = winner;
  }

  if (gameOverModal) {
    gameOverModal.style.display = "block";
  }

  gameState.isGameRunning = false;
}

function adjustCanvasSize() {
  if (
    gameState.maze_info &&
    gameState.maze_info.width &&
    gameState.maze_info.height
  ) {
    gameState.gameArea.setAttribute("width", gameState.maze_info.width);
    gameState.gameArea.setAttribute("height", gameState.maze_info.height);
    gameState.gameArea.style.position = "absolute";
    gameState.gameArea.style.left = "50%";
    gameState.gameArea.style.top = "50%";
    gameState.gameArea.style.transform = "translate(-50%, -50%)";
  }
}

// 检查设备方向
function checkOrientation() {
  if (window.screen.orientation.type.includes("portrait")) {
    // 竖屏
    document.body.classList.add("portrait");
  } else {
    // 横屏
    document.body.classList.remove("portrait");
  }
}

// 添加页面加载和方向变化事件监听器
window.addEventListener("load", checkOrientation);
window.addEventListener("orientationchange", checkOrientation);

// 导出所有函数
export {
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
};

function initJoystick() {
  const joystickContainer = document.getElementById("joystickContainer");
  const joystick = document.getElementById("joystick");
  let isDragging = false;
  let centerX, centerY;

  function handleStart(e) {
    isDragging = true;
    const touch = e.touches ? e.touches[0] : e;
    centerX = joystickContainer.offsetLeft + joystickContainer.offsetWidth / 2;
    centerY = joystickContainer.offsetTop + joystickContainer.offsetHeight / 2;
    updateJoystickPosition(touch.clientX, touch.clientY);
  }

  function handleMove(e) {
    if (!isDragging) return;
    const touch = e.touches ? e.touches[0] : e;
    updateJoystickPosition(touch.clientX, touch.clientY);
  }

  function handleEnd() {
    isDragging = false;
    joystick.style.transform = "translate(-50%, -50%)";
    socket.emit("player_move", { moving: 0 });
  }

  function updateJoystickPosition(x, y) {
    const deltaX = x - centerX;
    const deltaY = y - centerY;
    const distance = Math.min(
      joystickContainer.offsetWidth / 2,
      Math.sqrt(deltaX * deltaX + deltaY * deltaY)
    );
    const angle = Math.atan2(deltaY, deltaX);
    const joystickX = distance * Math.cos(angle);
    const joystickY = distance * Math.sin(angle);

    joystick.style.transform = `translate(${joystickX}px, ${joystickY}px)`;

    // 发送移动指令
    const moving = distance > 10 ? 1 : 0;
    const rotating = angle;
    socket.emit("player_move", { angle: angle, moving: moving });
  }

  joystickContainer.addEventListener("touchstart", handleStart);
  joystickContainer.addEventListener("touchmove", handleMove);
  joystickContainer.addEventListener("touchend", handleEnd);
}

function showJoystick() {
  const joystickContainer = document.getElementById("joystickContainer");
  joystickContainer.style.display = "block";
}

function hideJoystick() {
  const joystickContainer = document.getElementById("joystickContainer");
  joystickContainer.style.display = "none";
}

// 在适当的地方调用 initJoystick() 和 showJoystick()
// 例如，在游戏开始时或检测到移动设备时

// 添加射击功能
// document.addEventListener("touchstart", function (e) {
//   if (e.target.id !== "joystick" && e.target.id !== "joystickContainer") {
//     socket.emit("fire");
//   }
// });

// ... 导出新函数 ...
export {
  // ... 现有导出 ...
  initJoystick,
  showJoystick,
  hideJoystick,
};
