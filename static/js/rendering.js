import {
  FPS,
  explosionDuration,
  INTERPOLATION_DURATION,
  FIRE_COOLDOWN,
  CRYSTAL_RADIUS,
  CRYSTAL_FADE_DURATION,
  gameState,
} from "./gameState.js";
import { createSVGElement, calculateHexagonPoints } from "./utils.js";

// 绘制墙壁
function drawWall(wall) {
  const wallElement = createSVGElement("rect", {
    x: wall.x - gameState.maze_info.offset_x,
    y: wall.y - gameState.maze_info.offset_y,
    width: wall.width,
    height: wall.height,
    fill: "black",
  });
  gameState.gameArea.appendChild(wallElement);
}

// 绘制坦克
function drawTank(x, y, angle, color, alive, name, hasLaser) {
  const nameBackgroundColor = alive
    ? "rgba(0, 0, 0, 0.5)"
    : "rgba(128, 128, 128, 0.5)";
  const nameTextColor = alive ? "white" : "darkgray";
  const tankSize = 20; // 坦克尺寸
  const tankGroup = createSVGElement("g", {
    transform: `translate(${x - gameState.maze_info.offset_x} ${
      y - gameState.maze_info.offset_y
    })`,
  });

  // 坦克主体（旋转）
  const tankBody = createSVGElement("g", {
    transform: `rotate(${(angle * 180) / Math.PI})`,
  });

  // 坦克主体
  const body = createSVGElement("rect", {
    x: -tankSize / 2,
    y: -tankSize / 2,
    width: tankSize,
    height: tankSize,
    fill: alive ? color : "gray", // 如果玩家死亡，使用灰色
  });
  tankBody.appendChild(body);

  // 坦克履带
  const trackWidth = tankSize * 1.2;
  const trackHeight = tankSize * 0.2;
  const leftTrack = createSVGElement("rect", {
    x: -trackWidth / 2,
    y: -tankSize / 2 - trackHeight / 2,
    width: trackWidth,
    height: trackHeight,
    fill: "#666",
  });
  tankBody.appendChild(leftTrack);

  const rightTrack = createSVGElement("rect", {
    x: -trackWidth / 2,
    y: tankSize / 2 - trackHeight / 2,
    width: trackWidth,
    height: trackHeight,
    fill: "#666",
  });
  tankBody.appendChild(rightTrack);

  // 坦克炮塔
  const turret = createSVGElement(
    hasLaser ? "polygon" : "circle",
    hasLaser
      ? {
          points: calculateHexagonPoints(0, 0, tankSize / 2.5),
          fill: "purple",
        }
      : {
          cx: 0,
          cy: 0,
          r: tankSize / 3,
          fill: "#333",
        }
  );
  tankBody.appendChild(turret);

  // 坦克炮管
  const barrelLength = tankSize / 1.2; // 与服务器端的 barrel_length 保持一致
  const barrel = createSVGElement("line", {
    x1: 0,
    y1: 0,
    x2: hasLaser ? barrelLength / 1.2 : barrelLength,
    y2: 0,
    stroke: hasLaser ? "purple" : "#333",
    "stroke-width": tankSize / 6,
  });
  tankBody.appendChild(barrel);

  tankGroup.appendChild(tankBody);

  // 玩家名字（不旋转）
  const fontSize = tankSize / 2;
  const nameText = createSVGElement("text", {
    x: 0,
    y: -tankSize - 5,
    "text-anchor": "middle",
    fill: nameTextColor,
    "font-size": fontSize,
    "font-family": "GNU Unifont, sans-serif",
  });
  nameText.textContent = name;

  // 计算文本宽度
  gameState.gameArea.appendChild(nameText);
  const textWidth = nameText.getBBox().width;
  gameState.gameArea.removeChild(nameText);

  // 创建背景矩形，宽度基于文本宽度
  const padding = 4;
  const nameBackground = createSVGElement("rect", {
    x: -textWidth / 2 - padding,
    y: -tankSize - fontSize - padding - 5,
    width: textWidth + padding * 2,
    height: fontSize + padding * 2,
    fill: nameBackgroundColor,
    rx: 2,
    ry: 2,
  });

  tankGroup.appendChild(nameBackground);
  tankGroup.appendChild(nameText);

  gameState.gameArea.appendChild(tankGroup);
}

// 绘制子弹
function drawBullet(x, y) {
  const bullet = createSVGElement("circle", {
    cx: x - gameState.maze_info.offset_x,
    cy: y - gameState.maze_info.offset_y,
    r: 3,
    fill: "black",
  });
  gameState.gameArea.appendChild(bullet);
}

// 绘制爆炸效果
function drawExplosion(x, y, frame) {
  const size = 40;
  const maxFrames = 30;
  const explosion = createSVGElement("circle", {
    cx: x - gameState.maze_info.offset_x,
    cy: y - gameState.maze_info.offset_y,
    r: size * (frame / maxFrames),
    fill: `rgba(255, 100, 0, ${1 - frame / maxFrames})`,
  });
  gameState.gameArea.appendChild(explosion);
}

function drawCrystal(x, y, opacity = 1) {
  const crystal = createSVGElement("polygon", {
    points: calculateHexagonPoints(
      x - gameState.maze_info.offset_x,
      y - gameState.maze_info.offset_y,
      CRYSTAL_RADIUS
    ),
    fill: `rgba(128, 0, 128, ${opacity})`,
  });
  gameState.gameArea.appendChild(crystal);
}

function drawLaser() {
  // 首先，移除所有现有的激光元素
  // const existingLasers = gameArea.querySelectorAll(".laser");
  // existingLasers.forEach((laser) => laser.remove());

  gameState.lasers.forEach((laser) => {
    const laserGroup = createSVGElement("g", { class: "laser" });

    // 创建激光路径
    const pathData =
      `M${laser.x - gameState.maze_info.offset_x},${
        laser.y - gameState.maze_info.offset_y
      } ` +
      laser.reflected_points
        .map(
          (point) =>
            `L${point[0] - gameState.maze_info.offset_x},${
              point[1] - gameState.maze_info.offset_y
            }`
        )
        .join(" ");

    const laserPath = createSVGElement("path", {
      d: pathData,
      stroke: "mediumblue",
      "stroke-width": "3",
      fill: "none",
    });

    laserGroup.appendChild(laserPath);

    // 在每个反射点绘制一个小圆
    laser.reflected_points.forEach((point) => {
      const reflectionPoint = createSVGElement("circle", {
        cx: point[0] - gameState.maze_info.offset_x,
        cy: point[1] - gameState.maze_info.offset_y,
        r: "3",
        fill: "white",
      });
      laserGroup.appendChild(reflectionPoint);
    });

    gameState.gameArea.appendChild(laserGroup);
  });
}

// 绘制所有游戏元素
function drawPlayers() {
  if (!gameState.gameArea) {
    console.error("gameArea is not initialized");
    return;
  }
  gameState.gameArea.innerHTML = "";

  // 绘制墙壁
  for (let wall of gameState.walls) {
    drawWall(wall);
  }

  // 绘制玩家
  for (let id in gameState.players) {
    const player = gameState.players[id];
    if (player) {
      drawTank(
        player.x,
        player.y,
        player.angle,
        player.color,
        player.alive,
        player.name,
        player.has_laser
      );
    }
  }

  // 绘制子弹
  for (let bullet of gameState.bullets) {
    drawBullet(bullet.x, bullet.y);
  }

  // 绘制爆炸
  gameState.explosions = gameState.explosions.filter((explosion) => {
    const elapsedTime = performance.now() - explosion.startTime;
    if (elapsedTime < explosionDuration) {
      explosion.frame = Math.floor((elapsedTime / explosionDuration) * 30);
      drawExplosion(explosion.x, explosion.y, explosion.frame);
      return true;
    }
    return false;
  });

  // 绘制水晶
  // 绘制并过滤水晶
  gameState.crystals = gameState.crystals.filter((crystal) => {
    const elapsedTime = performance.now() - crystal.spawnTime;
    if (elapsedTime < 4000) {
      // 如果水晶存在时间少于4秒，正常绘制
      drawCrystal(crystal.x, crystal.y);
      return true;
    } else if (elapsedTime < 5000) {
      // 如果水晶存在时间在4-5秒之间，开始淡出效果
      const fadeProgress = (elapsedTime - 4000) / 1000;
      drawCrystal(crystal.x, crystal.y, 1 - fadeProgress);
      return true;
    }
    // 如果水晶存在时间超过5秒，从数组中移除
    return false;
  });

  drawLaser();
}

// 导出绘制函数
export {
  drawWall,
  drawTank,
  drawBullet,
  drawExplosion,
  drawCrystal,
  drawLaser,
  drawPlayers,
};
