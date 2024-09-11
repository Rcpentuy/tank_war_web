#!/bin/bash
set -e

# 拉取最新代码
git pull origin main

# 安装或更新依赖
pip install -r requirements.txt --quiet --no-input --upgrade --no-deps 2>/dev/null || true

# 检查是否安装了 systemctl
if ! command -v systemctl &> /dev/null; then
    echo "systemctl 未安装，正在尝试安装..."
    
    # 检测操作系统
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$NAME
    else
        OS=$(uname -s)
    fi
    
    # 根据不同的操作系统安装 systemd
    case $OS in
        "Ubuntu"|"Debian GNU/Linux")
            sudo apt-get update
            sudo apt-get install -y systemd
            ;;
        "CentOS Linux"|"Red Hat Enterprise Linux")
            sudo yum install -y systemd
            ;;
        "Fedora")
            sudo dnf install -y systemd
            ;;
        *)
            echo "无法识别的操作系统，请手动安装 systemd"
            exit 1
            ;;
    esac
    
    echo "systemd 安装完成"
fi

# 获取当前用户名
CURRENT_USER=$(whoami)

# 检查服务文件是否存在，如果不存在则创建
SERVICE_FILE="/etc/systemd/system/tankwar.service"
if [ ! -f "$SERVICE_FILE" ]; then
    echo "创建 tankwar 服务文件..."
    sudo tee "$SERVICE_FILE" > /dev/null <<EOT
[Unit]
Description=Tank War Game Server
After=network.target

[Service]
ExecStart=$(which gunicorn) --worker-class eventlet -w 1 wsgi:app
WorkingDirectory=$(pwd)
User=$CURRENT_USER
Group=$CURRENT_USER
Restart=always

[Install]
WantedBy=multi-user.target
EOT
    
    sudo systemctl daemon-reload
    sudo systemctl enable tankwar
fi

# 重启服务
sudo systemctl restart tankwar

# 检查服务状态
sudo systemctl status tankwar

echo "部署完成，请检查日志确保一切正常"