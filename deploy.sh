#!/bin/bash
set -e

# 拉取最新代码
git pull origin main

# 安装或更新依赖
pip install -r requirements.txt

# 重启服务
sudo systemctl restart tankwar

# 检查服务状态
sudo systemctl status tankwar

echo "部署完成，请检查日志确保一切正常"