import speech_recognition as sr
import whisper
import subprocess
import time
import numpy as np

print("⏳ 正在加载全新升级的语音引擎 (Whisper Small 高智商中文版)...")
model = whisper.load_model("small")  
print("✅ 大脑加载完成！")

recognizer = sr.Recognizer()
recognizer.dynamic_energy_threshold = True
recognizer.pause_threshold = 2.0  # 核心修复：允许您说话时停顿长达 2 秒，不会被中途无情挂断

# Mac 自带的 TTS 播报功能，用来实现“小智”回应
def speak_reply(text):
    print(f"🔊 播放语音: {text}")
    subprocess.run(["say", text])

def listen_for_command():
    with sr.Microphone(sample_rate=16000) as source:
        print("\n👂 [系统] 自动校准环境底噪中，请保持安静1秒钟...")
        recognizer.adjust_for_ambient_noise(source, duration=1.0)
        print(f"✅ 校准完毕！(当前房间背景噪音阈值: {recognizer.energy_threshold:.2f})")
        print("--------------------------------------------------")
        print("🎙️ 语音中枢【防幻听降噪版】已就绪！请随时呼唤 '你好老弟'")
        print("--------------------------------------------------")
        
        while True:
            try:
                audio = recognizer.listen(source, timeout=None, phrase_time_limit=5)
                audio_data = np.frombuffer(audio.get_raw_data(), dtype=np.int16).astype(np.float32) / 32768.0
                
                result = model.transcribe(audio_data, language="zh", fp16=False, initial_prompt="你好老弟，你在吗？")
                text = result["text"].strip()
                
                if not text: continue
                
                if any(keyword in text for keyword in ["你好老弟", "你好老底", "你好劳底", "你好弟"]):
                    print(f"\n✨ 唤醒成功！(触发词: {text})")
                    
                    # 关键升级：唤醒后立刻用 Mac 原生的 Siri 声音回应您！
                    speak_reply("老弟在呢，请讲！")
                    
                    print("🟢 老板请吩咐... (说完请停顿一下)")
                    
                    # 再次精准录制您要下达的指令
                    cmd_audio = recognizer.listen(source, timeout=10, phrase_time_limit=15)
                    cmd_audio_data = np.frombuffer(cmd_audio.get_raw_data(), dtype=np.int16).astype(np.float32) / 32768.0
                    
                    cmd_result = model.transcribe(cmd_audio_data, language="zh", fp16=False)
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
                            print("✅ 发送成功！\n")
                            # 可选：如果发给我也想让他报个信，可以说一句：
                            # speak_reply("收到老板")
                        except Exception as sub_e:
                            print(f"❌ 发送失败: {sub_e}")
                    
                    print("--- 重新进入休眠监听，等待唤醒 ---")
                    
            except sr.WaitTimeoutError:
                continue
            except KeyboardInterrupt:
                print("\n🛑 系统关闭。")
                break
            except Exception as e:
                pass

if __name__ == "__main__":
    listen_for_command()