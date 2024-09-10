@echo off
REM 激活虚拟环境（假设你使用的是 venv）
call .venv\Scripts\activate

REM 更新代码
git pull origin main

REM 安装或更新依赖
pip install -r requirements.txt

REM 启动服务器
gunicorn wsgi:app

REM 暂停以查看输出
pause