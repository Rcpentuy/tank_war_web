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

  gameState = "not_joined";

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
  if (maze_info && maze_info.width && maze_info.height) {
    const scale = Math.min(
      window.innerWidth / maze_info.width,
      window.innerHeight / maze_info.height
    );
    gameArea.setAttribute("width", maze_info.width * scale);
    gameArea.setAttribute("height", maze_info.height * scale);
  }
}

// 切换玩家列表显示
function togglePlayerList() {
  isPlayerListVisible = !isPlayerListVisible;
  const playerList = document.getElementById("playerList");
  playerList.style.display = isPlayerListVisible ? "block" : "none";
  if (isPlayerListVisible) {
    updatePlayerList();
  }
}

// 更新玩家列表
function updatePlayerList() {
  const playerList = document.getElementById("playerList");
  let listHtml = "<h3>在线玩家</h3>";
  for (let id in players) {
    const latency =
      playerLatencies[id] !== undefined ? playerLatencies[id] : "未知";
    listHtml += `<p>${players[id].name}: ${latency}ms</p>`;
  }
  playerList.innerHTML = listHtml;
}

function updateScoreBoard() {
  const scoreBoard = document.getElementById("scoreBoard");
  if (scoreBoard) {
    let scoreHtml = "<h3>胜利榜</h3>";
    let sortedPlayers = Object.entries(wins).sort((a, b) => b[1] - a[1]);
    for (let [id, winCount] of sortedPlayers) {
      if (players[id]) {
        scoreHtml += `<p>${players[id].name}: ${winCount}胜</p>`;
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
  gameState = "waiting";
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

  isGameRunning = false;
}

function adjustCanvasSize() {
  if (maze_info && maze_info.width && maze_info.height) {
    gameArea.setAttribute("width", maze_info.width);
    gameArea.setAttribute("height", maze_info.height);
    gameArea.style.position = "absolute";
    gameArea.style.left = "50%";
    gameArea.style.top = "50%";
    gameArea.style.transform = "translate(-50%, -50%)";
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
