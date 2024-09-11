#!/bin/bash
set -e

# 检查是否已安装 virtualenv
if ! command -v virtualenv &> /dev/null; then
    echo "virtualenv 未安装，正在安装..."
    pip install --user virtualenv
fi

# 设置虚拟环境名称
VENV_NAME="venv"

# 检查虚拟环境是否存在，如果不存在则创建
if [ ! -d "$VENV_NAME" ]; then
    echo "创建虚拟环境..."
    virtualenv $VENV_NAME
fi

# 激活虚拟环境
source $VENV_NAME/bin/activate

# 拉取最新代码
git pull origin main

# 安装或更新依赖
pip install -r requirements.txt

# 获取 gunicorn 的完整路径
GUNICORN_PATH="$VENV_NAME/bin/gunicorn"

# 启动 gunicorn
echo "启动 gunicorn..."
$GUNICORN_PATH --worker-class eventlet -w 1 wsgi:app

echo "部署完成，gunicorn 已启动"

# 注意：此脚本不会自动退出虚拟环境，因为 gunicorn 会在前台运行
# 如果您想在后台运行 gunicorn，可以在命令前加上 nohup，并在命令后加上 &
# 例如：nohup $GUNICORN_PATH --worker-class eventlet -w 1 wsgi:app > gunicorn.log 2>&1 &