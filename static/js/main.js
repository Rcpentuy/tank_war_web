import { joinGame, startGame, restartGame } from "./gameLogic.js";
import { drawPlayers } from "./rendering.js";
import { gameState, INTERPOLATION_DURATION } from "./gameState.js";
import { measureLatency, socket } from "./socket.js";
import "./socket.js"; // 导入socket.js以确保它被执行
import {
  logElementState,
  createSVGElement,
  calculateHexagonPoints,
  lerp,
  lerpAngle,
  addExplosion,
  svgNS,
} from "./utils.js";
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
import {
  handleMouseMove,
  handleMouseDown,
  handleMouseUp,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  handleEnterKey,
} from "./input.js";
// 页面加载完成后的初始化
window.onload = function () {
  setInterval(measureLatency, 5000); // 每5秒测量一次延迟

  console.log("Window loaded");
  gameState.gameArea = document.createElementNS(svgNS, "svg");
  gameState.gameArea.id = "gameArea";
  document.getElementById("gameContainer").appendChild(gameState.gameArea);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Tab") {
      event.preventDefault();
      togglePlayerList();
    }
  });

  const savedName = localStorage.getItem("playerName");
  if (savedName) {
    console.log("Saved name found:", savedName);
    showPlayerInfo(savedName);
    socket.emit("player_join", { name: savedName }); //改为rejoin？
  } else {
    console.log("No saved name, showing join form");
    showJoinForm();
  }

  // 事件监听器添加到 document 而不是 gameArea
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("mouseup", handleMouseUp);
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  gameState.gameArea.addEventListener("touchstart", handleTouchStart);
  gameState.gameArea.addEventListener("touchmove", handleTouchMove);
  gameState.gameArea.addEventListener("touchend", handleTouchEnd);

  console.log("Mouse event listeners added to document");

  // 将 resizeCanvas 的调用移到这里
  window.addEventListener("resize", resizeCanvas);

  // 添加屏幕方向变化监听
  window.addEventListener("orientationchange", resizeCanvas);

  // 初始调用 resizeCanvas
  resizeCanvas();

  const joinButton = document.getElementById("joinButton");
  const playerNameInput = document.getElementById("playerName");
  if (playerNameInput) {
    playerNameInput.addEventListener("keypress", handleEnterKey);
    console.log("Player name input event listener added");

    // 添加焦点和点击事件监听器
    playerNameInput.addEventListener("focus", function () {
      console.log("Input field focused");
    });
    playerNameInput.addEventListener("click", function () {
      console.log("Input field clicked");
    });

    // 尝试自动聚焦输入框
    setTimeout(() => {
      playerNameInput.focus();
      console.log("Attempted to focus input field");
    }, 500);
  } else {
    console.error("Player name input not found");
  }

  if (joinButton) {
    joinButton.addEventListener("click", joinGame);
    console.log("Join button event listener added");
  } else {
    console.error("Join button not found");
  }

  if (playerNameInput) {
    playerNameInput.addEventListener("keypress", handleEnterKey);
    console.log("Player name input event listener added");
  } else {
    console.error("Player name input not found");
  }

  // 添加这些调试日志
  logElementState("joinForm");
  logElementState("playerName");
  logElementState("joinButton");

  // 添加更改名字相关的事件监听器
  document
    .getElementById("changeNameButton")
    .addEventListener("click", showChangeNameForm);
  document
    .getElementById("newPlayerName")
    .addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        submitNewName();
      }
    });

  console.log("Window onload complete");
};

function updateGameState() {
  if (!gameState.lastGameState) {
    gameState.lastGameState = gameState.currentGameState;
  }

  try {
    // 遍历当前游戏状态中的所有玩家
    for (let id in gameState.currentGameState.players) {
      // 如果本地玩家对象中不存在该玩家，直接添加
      if (!gameState.players[id]) {
        gameState.players[id] = gameState.currentGameState.players[id];
      } else {
        // 获取上一帧的玩家状态，如果不存在则使用当前状态
        const lastPlayer =
          gameState.lastGameState.players[id] ||
          gameState.currentGameState.players[id];
        // 获取当前帧的玩家状态
        const currentPlayer = gameState.currentGameState.players[id];

        // 使用线性插值计算玩家的 X 坐标
        gameState.players[id].x = lerp(
          lastPlayer.x,
          currentPlayer.x,
          gameState.interpolationFactor
        );

        // 使用线性插值计算玩家的 Y 坐标
        gameState.players[id].y = lerp(
          lastPlayer.y,
          currentPlayer.y,
          gameState.interpolationFactor
        );

        // 使用角度插值计算玩家的旋转角度
        gameState.players[id].angle = lerpAngle(
          lastPlayer.angle,
          currentPlayer.angle,
          gameState.interpolationFactor
        );

        // 更新玩家的存活状态
        gameState.players[id].alive = currentPlayer.alive;

        // 更新玩家是否拥有激光武器
        gameState.players[id].has_laser = currentPlayer.has_laser;
      }
    }

    gameState.bullets = gameState.currentGameState.bullets.map(
      (currentBullet) => {
        const lastBullet = gameState.lastGameState.bullets.find(
          (b) => b.id === currentBullet.id
        );
        if (lastBullet) {
          return {
            x: lerp(
              lastBullet.x,
              currentBullet.x,
              gameState.interpolationFactor
            ),
            y: lerp(
              lastBullet.y,
              currentBullet.y,
              gameState.interpolationFactor
            ),
            angle: currentBullet.angle,
            speed: currentBullet.speed,
            id: currentBullet.id,
          };
        } else {
          return currentBullet;
        }
      }
    );

    gameState.lasers = gameState.currentGameState.lasers;

    // 删除不再存在的玩家
    for (let id in gameState.players) {
      if (!gameState.currentGameState.players[id]) {
        delete gameState.players[id];
        console.log(`玩家 ${id} 已从游戏中移除`);
      }
    }
  } catch (error) {
    console.error("Error updating game state:", error);
  }
}

function gameLoop(currentTime) {
  if (!gameState.isGameRunning || !gameState.gameArea) {
    console.log("Game not running or gameArea not initialized");
    return;
  }

  requestAnimationFrame(gameLoop);

  if (gameState.lastGameState && gameState.currentGameState) {
    gameState.interpolationFactor = Math.min(
      1,
      (currentTime - gameState.lastUpdateTime) / INTERPOLATION_DURATION
    );
    updateGameState();
  }

  // 检查玩家是否正在移动（通过鼠标或触摸）且玩家存在
  if (
    (gameState.isMoving || gameState.isTouchMoving) &&
    gameState.players[gameState.myId]
  ) {
    const player = gameState.players[gameState.myId];
    // 计算玩家当前位置到目标位置的水平和垂直距离
    const dx = gameState.targetX - player.x;
    const dy = gameState.targetY - player.y;
    // 计算玩家到目标位置的直线距离
    const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
    // 计算玩家到目标位置的角度
    const angle = Math.atan2(dy, dx);

    if (distanceToTarget > 5) {
      // 如果距离目标还有一定距离，继续移动
      socket.emit("player_move", { angle: angle, moving: true });
    } else {
      // 如果已经接近目标，停止移动
      gameState.isMoving = false;
      gameState.isTouchMoving = false;
      socket.emit("player_move", { angle: angle, moving: false });
    }
  }

  drawPlayers();

  // 检查是否所有爆炸动画都已结束，且有待处理的游戏结束事件
  if (gameState.gameOverPending && gameState.explosions.length === 0) {
    showGameOver(gameState.pendingWinner);
    gameState.gameOverPending = false;
    gameState.pendingWinner = null;
  }
}

// 这段代码添加了一个事件监听器，在DOM内容加载完成后执行
document.addEventListener("DOMContentLoaded", () => {
  // 获取游戏结束模态框中的重启按钮
  const restartButton = document
    .getElementById("gameOverModal")
    .querySelector("button");

  // 如果找到了重启按钮
  if (restartButton) {
    // 为重启按钮添加点击事件监听器，点击时调用restartGame函数
    restartButton.addEventListener("click", restartGame);
  }
});
// 这段代码的功能是：
// 1. 确保在DOM完全加载后执行，避免找不到元素的问题
// 2. 找到游戏结束模态框中的重启按钮
// 3. 为重启按钮添加点击事件，使玩家可以通过点击按钮重新开始游戏
// 4. 通过这种方式，实现了游戏结束后可以快速重新开始的功能

// 将需要全局访问的函数挂载到window对象上
// window.joinGame = joinGame;
// window.startGame = startGame;
// window.restartGame = restartGame;
// window.drawPlayers = drawPlayers;

export { gameLoop };
