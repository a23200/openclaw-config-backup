#!/bin/bash
# run.sh - 启动小智 MCP Server (如意-MOSS)

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 禁用代理（本地SOCKS代理会导致连接问题）
export no_proxy="*"
export NO_PROXY="*"
unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY

# 检测 Python 路径
if [ -f "$HOME/anaconda3/bin/python" ]; then
    PYTHON="$HOME/anaconda3/bin/python"
    PIP="$HOME/anaconda3/bin/pip"
elif [ -f "$HOME/miniconda3/bin/python" ]; then
    PYTHON="$HOME/miniconda3/bin/python"
    PIP="$HOME/miniconda3/bin/pip"
else
    PYTHON="python3"
    PIP="pip3"
fi

echo -e "${GREEN}=== 如意(MOSS) MCP Server for 小智AI ===${NC}"
echo ""

if [ -z "$MCP_ENDPOINT" ]; then
    echo -e "${RED}错误: 未设置 MCP_ENDPOINT${NC}"
    echo ""
    echo "请设置环境变量:"
    echo "  export MCP_ENDPOINT='wss://api.xiaozhi.me/mcp/?token=你的token'"
    echo ""
    exit 1
fi

echo "使用 Python: $PYTHON"
echo ""

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    echo "正在加载 .env 文件中的环境变量..."
    set -a # automatically export all variables
    source .env
    set +a
fi


echo -e "${YELLOW}检查依赖...${NC}"
$PIP install -r requirements.txt -q 2>/dev/null || true

echo -e "${GREEN}✓ 依赖就绪${NC}"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${YELLOW}配置:${NC}"
echo "  MCP Endpoint: ${MCP_ENDPOINT:0:50}..."
echo ""

echo -e "${GREEN}启动如意MCP服务... 按 Ctrl+C 停止${NC}"
echo "=========================================="
echo ""

exec $PYTHON mcp_pipe.py server.py
