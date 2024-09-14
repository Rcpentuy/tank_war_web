import { socket } from "./socket.js";
import { gameState } from "./gameState.js";
import { showPlayerInfo } from "./ui.js";
import { gameLoop } from "./main.js";

// 加入游戏
function joinGame() {
  const nameInput = document.getElementById("playerName");
  if (!nameInput) {
    console.error("Player name input not found");
    return;
  }
  const name = nameInput.value.trim();
  console.log("Attempting to join game with name:", name);
  if (name) {
    console.log("Joining game with name:", name);
    localStorage.setItem("playerName", name);
    socket.emit("player_join", { name: name });
    document.getElementById("joinForm").style.display = "none";
    showPlayerInfo(name);
    document.getElementById("gameInfo").style.display = "flex";
  } else {
    console.log("Name is empty, cannot join game");
    alert("请输入有效的名字");
  }
}

function startGame() {
  console.log("Starting game");
  document.getElementById("joinForm").style.display = "none";
  document.getElementById("gameInfo").style.display = "flex";
  document.getElementById("gameArea").style.display = "block";
  document.getElementById("waitingModal").style.display = "none";
  gameState.gameState = "playing";
  gameState.isGameRunning = true;
  gameState.lastTime = performance.now(); // 重置 lastTime
  requestAnimationFrame(gameLoop);
}

function restartGame() {
  console.log("Restarting game...");
  socket.emit("restart_game");
  document.getElementById("gameOverModal").style.display = "none";
}

export { joinGame, startGame, restartGame };
