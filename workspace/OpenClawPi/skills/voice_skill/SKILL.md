# 技能：语音技能

## 功能描述

基于 CosyVoice 提供文本转语音能力，让助手可以发声朗读，支持标准音色、多语种、自定义停顿、方言/语速/情绪等多样化语音合成需求。

## 触发规则

当助手需要生成并播放语音输出时自动调用。

## 使用说明

1.  若出现连接/执行错误，提示用户在 `cosyvoice` Conda 环境中启动 TTS 守护进程服务：`python tts_daemon.py`
2.  所有调用必须在 `cosyvoice` Conda 虚拟环境中执行
3.  所有参数中的特殊字符、中文内容需使用英文双引号包裹，避免格式解析错误
4.  当待朗读的文本长度超过150字符时，系统将自动将文本拆分为单段不超过150字符的多个片段，依次进行语音合成播报，避免模型输入尺寸超限错误；若手动调用时，也可自行拆分文本分批传入

## 支持调用模式

### 1. instruct2（自定义方言/语速/情绪）
#### 功能说明
支持指令式自定义语音控制，可指定方言、语速、情绪等风格，精准匹配语音合成需求。
#### 标准调用格式
```Bash
python agent_tts_client.py --mode instruct2 --content_text "需要朗读的文本" --prompt_text "You are a helpful assistant.[需要提供的提示词]<|endofprompt|>" --prompt_wav ./asset/zero_shot_prompt.wav
```
#### 格式说明
- 仅允许修改 `--content_text` 中的**需要朗读的文本**和 `--prompt_text` 中的**需要提供的提示词**部分
- 固定保留其余参数结构，不可修改参数顺序或删除必填参数

## 通用参数说明
|参数名|必选|说明|适用模式|
|---|---|---|---|
|`--mode`|是|合成模式，固定为`instruct2`|当前唯一支持模式|
|`--content_text`|是|核心合成文本，填写需要朗读的具体内容|instruct2|
|`--prompt_text`|是|提示词容器，固定格式为`"You are a helpful assistant.[提示词]<|endofprompt|>"`|instruct2|
|`--prompt_wav`|否|参考音频路径，默认值：`./asset/zero_shot_prompt.wav`|instruct2|

## 运行环境要求
- Conda 虚拟环境：`cosyvoice`
- 依赖包：`simpleaudio`、`numpy`、`torchaudio`（无需额外安装 PortAudio 系统库）
- 所有脚本需在此环境下运行

## 文件路径
- TTS 客户端脚本：`/home/agilex/.nanobot/workspace/skills/voice_skill/CosyVoice/agent_tts_client.py`
- TTS 守护进程脚本：`/home/agilex/.nanobot/workspace/skills/voice_skill/CosyVoice/tts_daemon.py`
- 默认参考音频：`/home/agilex/.nanobot/workspace/skills/voice_skill/asset/zero_shot_prompt.wav`

## 故障排查
- **连接失败错误**：请先在 `cosyvoice` 环境中启动 TTS 守护进程，确保守护进程常驻后台
- **Conda 环境缺失**：确认已正确创建 `cosyvoice` 环境，激活命令：`conda activate cosyvoice`
- **播放异常**：检查系统音频输出设备是否正常；若提示 `simpleaudio` 相关错误，执行 `pip install --reinstall simpleaudio` 重装依赖
- **参数格式错误**：确保参数名无拼写错误，特殊字符/中文使用英文双引号包裹，严格遵循指定格式模板