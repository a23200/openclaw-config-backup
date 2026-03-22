import pyaudio
import numpy as np
import whisper
import subprocess # 新增：用于调用底层命令行
import time

print("⏳ 正在加载 Whisper Base 大模型...")
model = whisper.load_model("base")
print("✅ 加载完成！")

FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
CHUNK = 16000 * 1  

audio = pyaudio.PyAudio()

def record_command(stream):
    print("\n🟢 [已唤醒] 老板请吩咐... (说完请停顿2秒)")
    frames = []
    silence_chunks = 0
    max_silence_chunks = 2  
    is_recording = False

    while True:
        data = stream.read(CHUNK, exception_on_overflow=False)
        audio_data = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
        rms = np.sqrt(np.mean(audio_data**2))

        if rms > 0.01:
            if not is_recording:
                print("   🎤 正在录音...")
                is_recording = True
            silence_chunks = 0
            frames.append(audio_data)
        else:
            if is_recording:
                silence_chunks += 1
                frames.append(audio_data) 
                if silence_chunks >= max_silence_chunks:
                    print("   ⏹️ 录音结束，处理中...")
                    break

    if frames:
        return np.concatenate(frames)
    return None

try:
    mic_stream = audio.open(format=FORMAT, channels=CHANNELS, 
                            rate=RATE, input=True, frames_per_buffer=CHUNK)

    print("--------------------------------------------------")
    print("👂 语音中枢全链路已打通！请随时呼唤 '老弟'")
    print("--------------------------------------------------")

    while True:
        data = mic_stream.read(CHUNK, exception_on_overflow=False)
        audio_data = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0

        if np.sqrt(np.mean(audio_data**2)) < 0.01: continue

        result = model.transcribe(audio_data, language="zh", fp16=False, initial_prompt="老弟老弟，你在吗？")
        text = result["text"].strip()
        
        if any(keyword in text for keyword in ["老弟", "老底", "劳底", "脑底", "弟"]):
            print(f"\n✨ 唤醒成功！(触发词: {text})")
            
            command_audio = record_command(mic_stream)
            
            if command_audio is not None:
                cmd_result = model.transcribe(command_audio, language="zh", fp16=False)
                cmd_text = cmd_result["text"].strip()
                
                print(f"\n🎯 [最终执行指令]: {cmd_text}")
                
                if len(cmd_text) > 1:
                    print("🚀 正在将指令发送给 OpenClaw 大脑...")
                    formatted_cmd = f"【来自语音助手的指令】：{cmd_text}"
                    try:
                        subprocess.run(
                            ["openclaw", "system", "event", "--mode", "now", "--text", formatted_cmd],
                            check=True,
                            capture_output=True
                        )
                        print("✅ 发送成功！请在聊天界面查看老弟的回复。\n")
                    except Exception as sub_e:
                        print(f"❌ 发送给 OpenClaw 失败: {sub_e}")
                
                print("--- 重新进入休眠监听，等待唤醒 ---")
            else:
                print("⚠️ 没听到指令，继续休眠。")

except KeyboardInterrupt:
    print("\n🛑 系统关闭。")
except Exception as e:
    print(f"❌ 运行出错: {e}")
finally:
    if 'mic_stream' in locals():
        mic_stream.stop_stream()
        mic_stream.close()
    if 'audio' in locals():
        audio.terminate()
