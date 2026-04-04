import sys
import os
import json
import socket
import threading
import numpy as np
import torch
import whisper
import pyaudio
import wave
import subprocess
from cosyvoice.cli.cosyvoice import AutoModel

# ====================== 配置项 ======================
WAKE_WORD = "你好老弟"
WAKE_RESPONSE = "老弟在呢请讲"
TARGET_SCRIPT = "/Users/mac/openclaw_voice_agent/wake_test_whisper.py"
MODEL_DIR = 'pretrained_models/Fun-CosyVoice3-0.5B'
PROMPT_WAV = "./asset/zero_shot_prompt.wav"
MIC_CHANNELS = 1
MIC_RATE = 16000
MIC_CHUNK = 1024
MIC_FORMAT = pyaudio.paInt16
SILENCE_THRESHOLD = 500  # 静音阈值
SILENCE_DURATION = 1.5   # 录音判断结束的静音时长（秒）

# ====================== 单例TTS模型 ======================
class CosyVoiceModel:
    _instance = None
    _sample_rate = None

    @classmethod
    def get(cls):
        if cls._instance is None:
            print(f"[TTS] 首次加载 CosyVoice3 模型 (来自: {MODEL_DIR})...")
            cls._instance = AutoModel(model_dir=MODEL_DIR)
            cls._sample_rate = cls._instance.sample_rate
            print("[TTS] 模型加载完毕。")
        return cls._instance, cls._sample_rate

# ====================== 主动语音助理 ======================
class VoiceAgent:
    def __init__(self):
        print("[助理] 正在初始化...")
        # 1. 初始化TTS
        self.tts_model, self.tts_sample_rate = CosyVoiceModel.get()
        
        # 2. 初始化STT (Whisper)
        print("[STT] 正在加载 Whisper 模型...")
        self.stt_model = whisper.load_model("base")
        print("[STT] Whisper 模型加载完毕。")

        # 3. 初始化麦克风
        self.audio = pyaudio.PyAudio()
        self.stream = self.audio.open(format=MIC_FORMAT,
                                      channels=MIC_CHANNELS,
                                      rate=MIC_RATE,
                                      input=True,
                                      frames_per_buffer=MIC_CHUNK)
        print("[麦克风] 麦克风已开启，准备监听。")

    def speak(self, text):
        """使用CosyVoice合成并播放语音"""
        print(f"🔊 正在说: {text}")
        try:
            gen = self.tts_model.inference_zero_shot(text, "", PROMPT_WAV, stream=False)
            for res in gen:
                audio_np = res['tts_speech'].squeeze().cpu().numpy()
                
                # 创建一个PyAudio的播放流
                p = pyaudio.PyAudio()
                play_stream = p.open(format=pyaudio.paFloat32,
                                     channels=1,
                                     rate=self.tts_sample_rate,
                                     output=True)
                # 播放音频
                play_stream.write(audio_np.astype(np.float32).tobytes())
                play_stream.stop_stream()
                play_stream.close()
                p.terminate()
                break # 只处理第一个生成结果
        except Exception as e:
            print(f"❌ 语音合成或播放失败: {e}")

    def listen_and_transcribe(self, timeout=None):
        """
        从麦克风录音，直到检测到静音，然后进行语音识别。
        - timeout: 如果设置了秒数，则最多录音这么久。
        """
        print("🎤 正在听...")
        frames = []
        silent_chunks = 0
        max_silent_chunks = int(SILENCE_DURATION * MIC_RATE / MIC_CHUNK)
        recording_started = False

        while True:
            data = self.stream.read(MIC_CHUNK, exception_on_overflow=False)
            frames.append(data)
            
            # 简单VAD：检查音量
            audio_data = np.frombuffer(data, dtype=np.int16)
            is_loud = np.abs(audio_data).mean() > SILENCE_THRESHOLD

            if is_loud:
                if not recording_started:
                    print("🎤 检测到声音，开始录制...")
                    recording_started = True
                silent_chunks = 0
            elif recording_started:
                silent_chunks += 1

            if recording_started and silent_chunks > max_silent_chunks:
                print("🎤 检测到静音，录制结束。")
                break
        
        # 将录音数据保存为临时的WAV文件
        temp_wav_path = "temp_recording.wav"
        with wave.open(temp_wav_path, 'wb') as wf:
            wf.setnchannels(MIC_CHANNELS)
            wf.setsampwidth(self.audio.get_sample_size(MIC_FORMAT))
            wf.setframerate(MIC_RATE)
            wf.writeframes(b''.join(frames))

        # 使用Whisper进行识别
        print("🧠 正在识别...")
        try:
            result = self.stt_model.transcribe(temp_wav_path, fp16=False)
            text = result['text'].strip()
            print(f"💬 识别结果: {text}")
            os.remove(temp_wav_path) # 删除临时文件
            return text
        except Exception as e:
            print(f"❌ 语音识别失败: {e}")
            return ""

    def run_target_script(self, command_text):
        """将识别到的指令发送到目标脚本"""
        if not os.path.exists(TARGET_SCRIPT):
            print(f"❌ 错误：目标脚本不存在！路径: {TARGET_SCRIPT}")
            self.speak("老板，目标脚本找不到了，请检查路径配置。")
            return
            
        print(f"🚀 正在将指令 '{command_text}' 发送到 '{TARGET_SCRIPT}'...")
        try:
            # 使用subprocess.run来执行脚本并传递参数
            # 注意：指令文本作为单个参数传递
            result = subprocess.run(
                ['python3', TARGET_SCRIPT, command_text],
                capture_output=True, text=True, check=True
            )
            print("✅ 指令已成功发送。")
            # 可以选择性地播报目标脚本的输出
            if result.stdout:
                print(f"📜 目标脚本输出:\n{result.stdout}")
        except FileNotFoundError:
             print(f"❌ 错误：python3 命令未找到，请确保已安装并配置好环境。")
             self.speak("老板，执行环境好像有点问题，找不到python3。")
        except subprocess.CalledProcessError as e:
            print(f"❌ 目标脚本执行出错！")
            print(f"   返回码: {e.returncode}")
            print(f"   输出: {e.stdout}")
            print(f"   错误: {e.stderr}")
            self.speak("老板，执行指令的时候出错了。")
        except Exception as e:
            print(f"❌ 发送指令时发生未知错误: {e}")
            self.speak("老板，发送指令的时候遇到了一个未知问题。")

    def start(self):
        """启动助理的主循环"""
        print("="*50)
        print(f"老弟语音助理已启动")
        print(f"唤醒词: '{WAKE_WORD}'")
        print("按 Ctrl+C 退出程序")
        print("="*50)

        try:
            while True:
                # 1. 监听唤醒词
                print("\n💤 等待唤醒...")
                text = self.listen_and_transcribe()
                if WAKE_WORD in text:
                    # 2. 唤醒并回应
                    self.speak(WAKE_RESPONSE)
                    
                    # 3. 监听完整指令
                    command = self.listen_and_transcribe()
                    if command:
                        # 4. 转发指令到目标脚本
                        self.run_target_script(command)
                    else:
                        print("🤔 未听到有效指令。")

        except KeyboardInterrupt:
            print("\n👋 收到退出指令，正在关闭...")
        finally:
            self.stream.stop_stream()
            self.stream.close()
            self.audio.terminate()
            print("💤 助理已休眠。")

if __name__ == "__main__":
    # 解决libomp库冲突问题
    os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'
    
    agent = VoiceAgent()
    agent.start()
