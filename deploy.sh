#!/bin/bash
set -e

#Ubuntu专用启动脚本，其余系统请手动完成此流程

# 检查是否已安装 virtualenv
if ! command -v virtualenv &> /dev/null; then
    echo "virtualenv 未在系统 PATH 中找到，尝试在用户本地路径中查找..."
    if [ -f "$HOME/.local/bin/virtualenv" ]; then
        echo "在用户本地路径中找到 virtualenv，添加到 PATH..."
        export PATH="$HOME/.local/bin:$PATH"
    else
        echo "virtualenv 未安装，正在安装..."
        pip install --user virtualenv
        export PATH="$HOME/.local/bin:$PATH"
    fi
fi

# 再次检查 virtualenv 是否可用
if ! command -v virtualenv &> /dev/null; then
    echo "安装 virtualenv 失败，请手动安装并确保其在 PATH 中"
    exit 1
fi

# 设置虚拟环境名称
VENV_NAME="venv"

# 检查虚拟环境是否存在，如果不存在则创建
if [ ! -d "$VENV_NAME" ]; then
    echo "创建虚拟环境..."
    $HOME/.local/bin/virtualenv $VENV_NAME
fi

# 激活虚拟环境
source $VENV_NAME/bin/activate

# 拉取最新代码
git fetch origin main
git reset --hard origin/main
git pull origin main

# 确保脚本文件具有执行权限
chmod +x deploy.sh

# 安装或更新依赖
pip install -r requirements.txt

# 检查并关闭已运行的gunicorn进程
if pgrep -f "gunicorn.*wsgi:app" > /dev/null; then
    echo "发现正在运行的gunicorn进程，正在关闭..."
    pkill -f "gunicorn.*wsgi:app"
    sleep 2  # 等待进程完全关闭
fi

# 获取 gunicorn 的完整路径
GUNICORN_PATH="$VENV_NAME/bin/gunicorn"

# 启动 gunicorn
echo "启动 gunicorn..."
nohup $GUNICORN_PATH --worker-class eventlet -w 1 wsgi:app &

echo "部署完成，gunicorn 已启动"

# 注意：此脚本不会自动退出虚拟环境，因为 gunicorn 会在前台运行
# 如果您想在后台运行 gunicorn，可以在命令前加上 nohup，并在命令后加上 &
# 例如：nohup $GUNICORN_PATH --worker-class eventlet -w 1 wsgi:app > gunicorn.log 2>&1 &