import { gameState, FIRE_COOLDOWN } from "./gameState";
import { socket } from "./socket";
import { joinGame } from "./gameLogic";
function handleMouseMove(event) {
  if (!gameState.gameArea || !gameState.maze_info) {
    console.error("gameArea or gameState.maze_info is not initialized");
    return;
  }

  // 这段代码用于获取游戏区域的位置和缩放比例
  // 获取游戏区域元素的边界矩形
  const rect = gameState.gameArea.getBoundingClientRect();
  // 计算游戏区域在水平方向的缩放比例
  const scaleX = gameState.gameArea.width.baseVal.value / rect.width;
  // 计算游戏区域在垂直方向的缩放比例
  const scaleY = gameState.gameArea.height.baseVal.value / rect.height;

  // 计算鼠标在游戏区域内的位置
  const gameMouseX = (event.clientX - rect.left) * scaleX;
  const gameMouseY = (event.clientY - rect.top) * scaleY;

  gameState.targetX = Math.max(
    gameState.maze_info.offset_x,
    Math.min(
      gameMouseX + gameState.maze_info.offset_x,
      gameState.maze_info.offset_x + gameState.maze_info.width
    )
  );
  gameState.targetY = Math.max(
    gameState.maze_info.offset_y,
    Math.min(
      gameMouseY + gameState.maze_info.offset_y,
      gameState.maze_info.offset_y + gameState.maze_info.height
    )
  );
}

// 处理鼠标按下事件
function handleMouseDown(event) {
  event.preventDefault();
  if (event.button === 0) {
    // 左键按下
    gameState.isMoving = true;
    handleMouseMove(event); // 立即更新目标位置
  } else if (event.button === 2) {
    // 右键按下
    const currentTime = performance.now();
    if (currentTime - gameState.lastFireTime >= FIRE_COOLDOWN) {
      console.log("Attempting to fire");
      socket.emit("fire");
      gameState.lastFireTime = currentTime;
    } else {
      console.log("Fire on cooldown");
    }
  }
}

// 处理鼠标松开事件
function handleMouseUp(event) {
  event.preventDefault();
  if (event.button === 0) {
    // 左键松开
    gameState.isMoving = false;
    socket.emit("player_move", { moving: 0 });
    console.log("鼠标已松开");
  }
}

// 处理触摸开始事件
function handleTouchStart(event) {
  event.preventDefault();
  const touch = event.touches[0];
  gameState.touchStartTime = performance.now();

  // 设置一个定时器，如果超过 300ms 没有触发 touchend，就认为是长按
  gameState.touchTimeout = setTimeout(() => {
    gameState.isTouchMoving = true;
    updateTouchPosition(touch);
  }, 300);
}

// 处理触摸移动事件
function handleTouchMove(event) {
  event.preventDefault();
  if (gameState.isTouchMoving) {
    const touch = event.touches[0];
    updateTouchPosition(touch);
  }
}

// 处理触摸结束事件
function handleTouchEnd(event) {
  event.preventDefault();
  clearTimeout(gameState.touchTimeout);

  if (gameState.isTouchMoving) {
    // 如果是移动状态，停止移动
    gameState.isTouchMoving = false;
    gameState.isMoving = false;
    const currentAngle = gameState.players[myId]
      ? gameState.players[myId].angle
      : 0;
    socket.emit("player_move", { angle: currentAngle, moving: false });
  } else if (performance.now() - gameState.touchStartTime < 300) {
    // 如果触摸时间小于 300ms，视为单击，触发发射
    const currentTime = performance.now();
    if (currentTime - gameState.lastFireTime >= FIRE_COOLDOWN) {
      console.log("Attempting to fire");
      socket.emit("fire");
      gameState.lastFireTime = currentTime;
    } else {
      console.log("Fire on cooldown");
    }
  }
}

// 更新触摸位置
function updateTouchPosition(touch) {
  const rect = gameState.gameArea.getBoundingClientRect();
  const scaleX = gameState.gameArea.width.baseVal.value / rect.width;
  const scaleY = gameState.gameArea.height.baseVal.value / rect.height;

  // 计算触摸点在游戏区域内的位置
  const gameTouchX = (touch.clientX - rect.left) * scaleX;
  const gameTouchY = (touch.clientY - rect.top) * scaleY;

  // 限制触摸点在游戏区域内
  gameState.targetX = Math.max(
    gameState.maze_info.offset_x,
    Math.min(
      gameTouchX + gameState.maze_info.offset_x,
      gameState.maze_info.offset_x + gameState.maze_info.width
    )
  );
  gameState.targetY = Math.max(
    gameState.maze_info.offset_y,
    Math.min(
      gameTouchY + gameState.maze_info.offset_y,
      gameState.maze_info.offset_y + gameState.maze_info.height
    )
  );

  // 触发移动
  gameState.isMoving = true;
  if (gameState.players[myId]) {
    const player = gameState.players[myId];
    const dx = gameState.targetX - player.x;
    const dy = gameState.targetY - player.y;
    const angle = Math.atan2(dy, dx);
    socket.emit("player_move", { angle: angle, moving: true });
  }
}

// 处理回车键
function handleEnterKey(event) {
  if (event.key === "Enter") {
    joinGame();
  }
}

// 阻止右键菜单弹出
document.addEventListener(
  "contextmenu",
  function (e) {
    e.preventDefault();
  },
  false
);
// 导出所有函数
export {
  handleMouseMove,
  handleMouseDown,
  handleMouseUp,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  handleEnterKey,
};
