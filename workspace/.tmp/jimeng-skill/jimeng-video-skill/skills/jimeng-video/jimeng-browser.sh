#!/bin/bash
# jimeng-browser.sh - 即梦视频生成浏览器自动化工具
# 通过 OpenClaw CLI 控制已打开的即梦网页
#
# ============================================================
# 实践经验（持续更新）
# ============================================================
# 【参数设置顺序】
#   切换"全能参考"模式后，系统会自动把模型重置为 Seedance 2.0 Fast
#   正确顺序：先 set-mode → 再 set-model → 再 set-duration
#   使用 set-params 命令一键完成（默认：全能参考 / Seedance 2.0 / 15s）
#
# 【参考图上传 - 全能参考模式】
#   全能参考模式下没有 upload-trigger，需用 setInputFiles 直接注入
#   正确 selector：input[type=file][accept*="video"]（接受 image+video+audio）
#   首帧/尾帧槽位只接受 image，不能用于全能参考
#   剧本中出现的所有角色都要上传参考图（多角色场景上传多张）
#
# 【视频时长】
#   目标时长 15s，切换模式/模型后需重新确认
# ============================================================

set -euo pipefail

# 加载 nvm 并切换到 Node.js 22
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 > /dev/null 2>&1

PROFILE="user"
UPLOAD_DIR="/tmp/openclaw/uploads"
OPENCLAW_URL="${OPENCLAW_URL:-}"
OPENCLAW_TOKEN="${OPENCLAW_TOKEN:-}"

openclaw_browser_raw() {
  local cmd=(openclaw browser --browser-profile "$PROFILE" "$@")
  if [ -n "$OPENCLAW_URL" ]; then
    cmd+=(--url "$OPENCLAW_URL")
  fi
  if [ -n "$OPENCLAW_TOKEN" ]; then
    cmd+=(--token "$OPENCLAW_TOKEN")
  fi
  "${cmd[@]}"
}

oc_browser() {
  openclaw_browser_raw "$@" 2>&1 | grep -v "^│\|^◇\|^├\|^Now using\|Doctor warnings\|telegram\|groupPolicy\|allowFrom\|groupAllowFrom"
}

cmd_status() {
  echo "=== 即梦标签页状态 ==="
  oc_browser tabs
}

cmd_snapshot() {
  local format="${1:-ai}"
  oc_browser snapshot --format "$format"
}

cmd_screenshot() {
  oc_browser screenshot ${1:+--full-page}
}

cmd_upload() {
  # 支持 1-5 个文件参数: upload <file1> [file2] [file3] [file4] [file5]
  local files=("$@")
  if [ ${#files[@]} -eq 0 ]; then
    echo "ERROR: 请指定至少一个文件"
    exit 1
  fi
  if [ ${#files[@]} -gt 5 ]; then
    echo "ERROR: 最多支持 5 个文件，当前 ${#files[@]} 个"
    exit 1
  fi

  # 验证所有文件存在并复制到 openclaw uploads 目录
  mkdir -p "$UPLOAD_DIR"
  local upload_paths=()
  for filepath in "${files[@]}"; do
    if [ ! -f "$filepath" ]; then
      echo "ERROR: 文件不存在: $filepath"
      exit 1
    fi
    local filename
    filename=$(basename "$filepath")
    # 用时间戳避免文件名冲突
    local dest="$UPLOAD_DIR/${RANDOM}_${filename}"
    cp "$filepath" "$dest"
    upload_paths+=("$dest")
    echo "准备上传: $filename"
  done

  # 逐个上传（即梦每次文件选择器只接受一个文件）
  for upath in "${upload_paths[@]}"; do
    local fname
    fname=$(basename "$upath")
    echo "上传中: $fname"

    # 查找上传按钮 ref
    local snap upload_ref
    snap=$(oc_browser snapshot --format ai 2>&1)
    upload_ref=$(echo "$snap" | grep "upload-trigger" | sed 's/.*\[ref=\(e[0-9]*\)\].*/\1/' | head -1 || true)

    if [ -n "$upload_ref" ]; then
      # 首尾帧模式：arm + click upload-trigger
      oc_browser upload "$upath" --element "input[type=file]" > /dev/null
      oc_browser click "$upload_ref" > /dev/null
    else
      # 全能参考模式：直接 setInputFiles 注入到参考内容槽位
      # selector: input[type=file][accept*="video"]（接受 image+video+audio，区别于首帧/尾帧的纯 image）
      oc_browser upload "$upath" --element "input[type=file][accept*='video']" > /dev/null
    fi
    sleep 3
    echo "OK: $fname 已上传"
  done

  # 清理临时文件
  for upath in "${upload_paths[@]}"; do
    rm -f "$upath"
  done

  echo "OK: 全部 ${#files[@]} 个文件上传完成"
}

cmd_clear_refs() {
  # 清除输入区域所有已上传的参考素材
  local result
  result=$(oc_browser evaluate --fn '(function(){
    var btns = document.querySelectorAll("[class*=remove-button-container] [class*=remove-button]");
    if(btns.length === 0) return "0";
    for(var i = btns.length - 1; i >= 0; i--) btns[i].click();
    return String(btns.length);
  })()')
  local count
  count=$(echo "$result" | tr -d '"')
  if [ "$count" = "0" ]; then
    echo "没有需要清除的参考素材"
  else
    echo "OK: 已清除 $count 个参考素材"
  fi
}

cmd_type_prompt() {
  local prompt="$1"
  local ref="${2:-}"

  if [ -z "$ref" ]; then
    # 查找 prompt 输入框：排除搜索框，找最后一个 textbox
    local snap
    snap=$(oc_browser snapshot --format ai 2>&1)
    ref=$(echo "$snap" | grep 'textbox' | grep -v '搜索' | sed 's/.*\[ref=\(e[0-9]*\)\].*/\1/' | tail -1)
    if [ -z "$ref" ]; then
      echo "ERROR: 找不到 prompt 输入框"
      exit 1
    fi
    echo "找到输入框: $ref"
  fi

  # 先清空输入框
  oc_browser click "$ref"
  sleep 0.3
  oc_browser press Meta+a
  sleep 0.1
  oc_browser press Backspace
  sleep 0.2

  # 输入 prompt
  oc_browser type "$ref" "$prompt"
  echo "OK: 已输入 prompt"
}

cmd_generate() {
  local snapshot
  snapshot=$(oc_browser snapshot --format ai 2>&1)

  # 查找生成按钮：在创意设计按钮之后、不含文字的 button
  local gen_ref
  gen_ref=$(echo "$snapshot" | grep 'button.*\[ref=e' | grep -v "disabled\|自动\|灵感搜索\|创意设计\|回到底部\|反馈\|再次生成\|重新编辑\|搜索\|upload-trigger\|file-input\|16:9" | sed 's/.*\[ref=\(e[0-9]*\)\].*/\1/' | tail -1)

  if [ -z "$gen_ref" ]; then
    echo "ERROR: 找不到可用的生成按钮"
    echo "提示: 请确保已输入 prompt（上传内容可选）"
    exit 1
  fi

  oc_browser click "$gen_ref"
  echo "OK: 已点击生成按钮 ($gen_ref)"
}

cmd_list_videos() {
  # 列出页面上所有可下载的视频（有 video.src 的）
  local result
  result=$(oc_browser evaluate --fn '(function(){
    var videos = document.querySelectorAll("video");
    var list = [];
    for(var i = 0; i < videos.length; i++){
      var src = videos[i].src || "";
      if(!src) continue;
      // 找到所属任务卡片的提示词
      var card = videos[i].closest("[class*=item-]");
      var prompt = "";
      if(card){
        var promptEl = card.querySelector("[class*=prompt-text], [class*=record-content] > div:first-child");
        if(promptEl) prompt = promptEl.textContent.trim().substring(0, 60);
      }
      list.push({index: i, url: src, prompt: prompt});
    }
    return JSON.stringify(list);
  })()')
  result=$(echo "$result" | sed 's/^"//;s/"$//' | sed 's/\\"/"/g' | sed 's/\\\\"/"/g')

  local count
  count=$(echo "$result" | python3 -c "import sys,json; print(len(json.loads(sys.stdin.read())))" 2>/dev/null || echo "0")

  if [ "$count" = "0" ]; then
    echo "没有可下载的视频"
    return
  fi

  echo "可下载的视频 ($count 个):"
  echo "$result" | python3 -c "
import sys, json
videos = json.loads(sys.stdin.read())
for v in videos:
    prompt = v['prompt'][:50] + '...' if len(v['prompt']) > 50 else v['prompt']
    print(f\"  [{v['index']}] {prompt or '(无提示词)'}\")
"
}

cmd_download_video() {
  local index="${1:-0}"
  local dest_dir="${2:-$HOME/Documents}"

  mkdir -p "$dest_dir"

  # 直接从 video 元素拿 src URL 和 prompt，用 curl 下载（绕过虚拟列表 ref 回收问题）
  local info_js
  info_js="(function(){
    var videos = document.querySelectorAll(\"video\");
    if(videos.length === 0) return \"no_videos\";
    var idx = $index;
    if(idx >= videos.length) return \"index_out_of_range:\" + videos.length;
    var v = videos[idx];
    var src = v.src || v.currentSrc || \"\";
    if(!src) return \"no_src\";
    var prompt = \"\";
    var card = v.closest(\"[class*=item-]\") || v.closest(\"[class*=record]\") || v.closest(\"[class*=wrapper]\");
    if(card){
      var el = card.querySelector(\"[class*=prompt-text], [class*=record-content] > div:first-child\");
      if(el) prompt = el.textContent.trim().replace(/[\\n\\r]/g,\" \").substring(0,40);
    }
    return src + \"|||\" + prompt;
  })()"

  local info
  info=$(oc_browser evaluate --fn "$info_js")
  info=$(echo "$info" | tr -d '"')

  case "$info" in
    no_videos|index_out_of_range:*|no_src)
      echo "ERROR: $info"
      return 1
      ;;
  esac

  local video_url prompt_text
  video_url=$(echo "$info" | cut -d'|' -f1)
  prompt_text=$(echo "$info" | sed 's/.*|||//')

  # 生成文件名：jimeng-{date}-{random}-{prompt}.mp4
  local date_str rand_id safe_prompt filename
  date_str=$(date +%Y-%m-%d)
  rand_id=$RANDOM
  safe_prompt=$(echo "$prompt_text" | tr -d '/:*?"<>\\' | cut -c1-30)
  filename="jimeng-${date_str}-${rand_id}-${safe_prompt}.mp4"
  local dest_path="$dest_dir/$filename"

  echo "正在下载视频 [$index]..."
  if curl -sL --max-time 120 -o "$dest_path" "$video_url"; then
    local size
    size=$(du -h "$dest_path" | cut -f1)
    echo "OK: 下载完成 ($size) -> $dest_path"
  else
    rm -f "$dest_path"
    echo "ERROR: curl 下载失败"
    return 1
  fi
}

# 通用：点开一个 combobox（其子文字匹配 child_pattern），再选目标选项
# option 的 accessible name 可能包含描述，用前缀匹配
_click_combobox_by_child() {
  local child_pattern="$1"
  local target="$2"

  local snap opt_ref ref

  snap=$(oc_browser snapshot --format ai 2>&1)

  # 先检查下拉是否已经展开（直接找目标 option）
  opt_ref=$(echo "$snap" | grep "option \"$target" | sed 's/.*\[ref=\(e[0-9]*\)\].*/\1/' | head -1 || true)

  if [ -z "$opt_ref" ]; then
    # 在全快照里找：combobox 行的下一行包含 child_pattern
    ref=$(echo "$snap" | grep -B1 -E "$child_pattern" | grep "combobox" | sed 's/.*\[ref=\(e[0-9]*\)\].*/\1/' | head -1 || true)
    if [ -z "$ref" ]; then
      echo "ERROR: 找不到包含 \"$child_pattern\" 的 combobox"
      return 1
    fi
    oc_browser click "$ref" > /dev/null
    sleep 0.8
    snap=$(oc_browser snapshot --format ai 2>&1)
    opt_ref=$(echo "$snap" | grep "option \"$target" | sed 's/.*\[ref=\(e[0-9]*\)\].*/\1/' | head -1 || true)
  fi

  if [ -z "$opt_ref" ]; then
    echo "ERROR: 找不到选项 \"$target\""
    return 1
  fi

  oc_browser click "$opt_ref" > /dev/null
  echo "OK: 已选择 \"$target\""
}

cmd_set_model() {
  local model="${1:?用法: set-model <模型名，如 'Seedance 2.0'>}"
  _click_combobox_by_child "Seedance|视频 [0-9]" "$model"
}

cmd_set_duration() {
  local dur="${1:?用法: set-duration <时长，如 15s>}"
  [[ "$dur" != *s ]] && dur="${dur}s"

  local snap opt_ref ref
  snap=$(oc_browser snapshot --format ai 2>&1)

  # 先检查下拉是否已展开
  opt_ref=$(echo "$snap" | grep "option \"$dur\"" | sed 's/.*\[ref=\(e[0-9]*\)\].*/\1/' | head -1 || true)

  if [ -z "$opt_ref" ]; then
    # 时长 combobox：其子 generic 以 Xs 结尾，且上一行是 combobox（区别于历史卡片）
    ref=$(echo "$snap" | grep -B1 -E ": [0-9]+s$" | grep "combobox" | sed 's/.*\[ref=\(e[0-9]*\)\].*/\1/' | head -1 || true)
    if [ -z "$ref" ]; then echo "ERROR: 找不到时长控件"; return 1; fi
    oc_browser click "$ref" > /dev/null
    sleep 0.8
    snap=$(oc_browser snapshot --format ai 2>&1)
    opt_ref=$(echo "$snap" | grep "option \"$dur\"" | sed 's/.*\[ref=\(e[0-9]*\)\].*/\1/' | head -1 || true)
  fi

  if [ -z "$opt_ref" ]; then echo "ERROR: 找不到时长选项 \"$dur\""; return 1; fi
  oc_browser click "$opt_ref" > /dev/null
  echo "OK: 时长已切换为 $dur"
}

cmd_set_ratio() {
  local ratio="${1:?用法: set-ratio <比例，如 16:9>}"

  local snap opt_ref ref
  snap=$(oc_browser snapshot --format ai 2>&1)

  # 比例选项结构：generic[cursor=pointer] > radio "16:9"
  opt_ref=$(echo "$snap" | grep -B1 "radio \"$ratio\"" | grep "generic.*cursor=pointer" | sed 's/.*\[ref=\(e[0-9]*\)\].*/\1/' | head -1 || true)

  if [ -z "$opt_ref" ]; then
    # 下拉未展开，先点比例按钮
    ref=$(echo "$snap" | grep -E "button \"[0-9]+:[0-9]+\"" | grep -v "disabled" | sed 's/.*\[ref=\(e[0-9]*\)\].*/\1/' | head -1 || true)
    if [ -z "$ref" ]; then echo "ERROR: 找不到比例按钮"; return 1; fi
    oc_browser click "$ref" > /dev/null
    sleep 0.8
    snap=$(oc_browser snapshot --format ai 2>&1)
    opt_ref=$(echo "$snap" | grep -B1 "radio \"$ratio\"" | grep "generic.*cursor=pointer" | sed 's/.*\[ref=\(e[0-9]*\)\].*/\1/' | head -1 || true)
  fi

  if [ -z "$opt_ref" ]; then echo "ERROR: 找不到比例选项 \"$ratio\""; return 1; fi
  oc_browser click "$opt_ref" > /dev/null
  echo "OK: 比例已切换为 $ratio"
}

cmd_set_mode() {
  local mode="${1:?用法: set-mode <全能参考|首尾帧>}"
  _click_combobox_by_child "首尾帧|全能参考" "$mode"
}

# 一键设置生成参数（正确顺序：先设模式，再设模型，最后设时长）
# 切换到"全能参考"后系统会自动把模型改回 Fast，所以必须在切换模式后再设模型
cmd_set_params() {
  local mode="${1:-全能参考}"
  local model="${2:-Seedance 2.0}"
  local duration="${3:-15s}"
  echo "设置参数: 模式=$mode 模型=$model 时长=$duration"
  cmd_set_mode "$mode"
  sleep 0.5
  cmd_set_model "$model"
  sleep 0.5
  cmd_set_duration "$duration"
  echo "OK: 参数设置完成"
}

cmd_check_result() {
  # 从快照里读取最新任务状态，输出结构化结果供 Claude Code 解析
  local snap
  snap=$(oc_browser snapshot --format ai 2>&1)

  # 最新任务在列表最前面（ref 最大）
  # 按顺序检查各种状态文字
  local first_task
  first_task=$(echo "$snap" | awk '/再次生成|重新编辑|生成中|排队/{found=1} found{print; if(/再次生成|重新编辑/) exit}' | head -40)

  if [ -z "$first_task" ]; then
    echo "STATUS: no_task"
    echo "MESSAGE: 没有找到生成任务"
    return
  fi

  # 检查错误类型
  if echo "$snap" | grep -q "人脸信息"; then
    echo "STATUS: error"
    echo "ERROR_TYPE: face_detected"
    echo "MESSAGE: 识别到素材包含人脸信息，请更换素材"
    return
  fi
  if echo "$snap" | grep -q "未通过审核"; then
    echo "STATUS: error"
    echo "ERROR_TYPE: review_rejected"
    echo "MESSAGE: 视频未通过审核，本次不消耗积分"
    return
  fi
  if echo "$snap" | grep -q "违反\|违规"; then
    echo "STATUS: error"
    echo "ERROR_TYPE: text_policy_violation"
    echo "MESSAGE: 提示词违反平台规则"
    return
  fi
  if echo "$snap" | grep -q "积分不足"; then
    echo "STATUS: error"
    echo "ERROR_TYPE: insufficient_credits"
    echo "MESSAGE: 积分不足"
    return
  fi
  if echo "$snap" | grep -q "服务繁忙\|稍后再试"; then
    echo "STATUS: error"
    echo "ERROR_TYPE: server_busy"
    echo "MESSAGE: 服务繁忙，请稍后重试"
    return
  fi

  # 检查生成中/排队
  if echo "$snap" | grep -q "排队"; then
    echo "STATUS: queued"
    echo "MESSAGE: 排队等待中"
    return
  fi
  if echo "$snap" | grep -qv "重新编辑" && echo "$snap" | grep -q "生成中\|正在生成"; then
    echo "STATUS: generating"
    echo "MESSAGE: 视频生成中"
    return
  fi

  # 有"重新编辑"按钮 = 成功
  if echo "$snap" | grep -q "重新编辑"; then
    echo "STATUS: success"
    echo "MESSAGE: 视频生成成功，可用 list-videos 查看"
    return
  fi

  echo "STATUS: generating"
  echo "MESSAGE: 生成中（未检测到明确状态）"
}

cmd_click() {
  local ref="$1"
  oc_browser click "$ref"
}

cmd_wait_text() {
  local text="$1"
  local timeout="${2:-60000}"
  oc_browser wait --text "$text" --timeout-ms "$timeout"
}

cmd_evaluate() {
  local js="$1"
  oc_browser evaluate --fn "$js"
}

# 主命令分发
case "${1:-help}" in
  status)     cmd_status ;;
  snapshot)   cmd_snapshot "${2:-ai}" ;;
  screenshot) cmd_screenshot "${2:-}" ;;
  upload)         shift; cmd_upload "$@" ;;
  clear-refs)     cmd_clear_refs ;;
  list-videos)    cmd_list_videos ;;
  download-video) cmd_download_video "${2:-0}" "${3:-$HOME/Documents}" ;;
  prompt)     cmd_type_prompt "${2:?用法: jimeng-browser.sh prompt <提示词>}" "${3:-}" ;;
  generate)   cmd_generate ;;
  check-result) cmd_check_result ;;
  set-model)    cmd_set_model "${2:-}" ;;
  set-duration) cmd_set_duration "${2:-}" ;;
  set-ratio)    cmd_set_ratio "${2:-}" ;;
  set-mode)     cmd_set_mode "${2:-}" ;;
  set-params)   cmd_set_params "${2:-全能参考}" "${3:-Seedance 2.0}" "${4:-15s}" ;;
  click)      cmd_click "${2:?用法: jimeng-browser.sh click <ref>}" ;;
  wait)       cmd_wait_text "${2:?用法: jimeng-browser.sh wait <文本>}" "${3:-60000}" ;;
  eval)       cmd_evaluate "${2:?用法: jimeng-browser.sh eval <js表达式>}" ;;
  help)
    echo "即梦视频生成浏览器自动化工具"
    echo ""
    echo "用法: jimeng-browser.sh <命令> [参数]"
    echo ""
    echo "命令:"
    echo "  status                    查看即梦标签页状态"
    echo "  snapshot [format]         获取页面快照 (ai/aria)"
    echo "  screenshot [full]         截图 (Claude Code 看图判断结果)"
    echo "  upload <文件...>           上传 1-5 个图片/视频"
    echo "  clear-refs                清除已上传的参考素材"
    echo "  prompt <提示词>            输入生成提示词"
    echo "  generate                  点击生成按钮"
    echo "  check-result              检查最新任务生成状态（结构化输出）"
    echo "  list-videos               列出页面上可下载的视频"
    echo "  download-video [idx] [dir] 下载视频到指定目录 (默认索引0, ~/Documents)"
    echo "  click <ref>               点击指定元素"
    echo "  wait <文本>                等待页面出现指定文本"
    echo "  eval <js>                 执行 JavaScript"
    echo ""
    echo "典型工作流:"
    echo "  1. screenshot  → Claude Code 看图判断哪些视频已完成/失败"
    echo "  2. list-videos → 查看可下载的视频列表"
    echo "  3. download-video 0 /path/to/dir → 下载指定视频"
    ;;
  *)
    echo "未知命令: $1"
    echo "运行 jimeng-browser.sh help 查看帮助"
    exit 1
    ;;
esac
