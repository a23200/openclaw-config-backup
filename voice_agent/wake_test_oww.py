import pyaudio
import numpy as np
from openwakeword.model import Model

print("⏳ 正在加载本地开源唤醒词模型 (使用 ONNX 引擎)...")
# 既然真正的模型文件已经通过官方渠道下好了，直接写 "hey_jarvis" 即可
owwModel = Model(wakeword_models=["hey_jarvis"], inference_framework="onnx")

FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 16000
CHUNK = 1280

audio = pyaudio.PyAudio()

try:
    mic_stream = audio.open(format=FORMAT, channels=CHANNELS, 
                            rate=RATE, input=True, frames_per_buffer=CHUNK)

    print("✅ 加载完成！")
    print("👂 麦克风已开启，纯本地无限制模式！")
    print("📢 请对着麦克风清晰地说：'Hey Jarvis'")

    while True:
        audio_data = np.frombuffer(mic_stream.read(CHUNK, exception_on_overflow=False), dtype=np.int16)
        
        prediction = owwModel.predict(audio_data)
        
        score = prediction.get('hey_jarvis', 0)
        if score > 0.5:
            print(f"✨ 唤醒成功！Jarvis 在听！(置信度: {score:.2f})")

except KeyboardInterrupt:
    print("\n🛑 停止监听。")
except Exception as e:
    print(f"❌ 运行出错啦: {e}")
finally:
    if 'mic_stream' in locals():
        mic_stream.stop_stream()
        mic_stream.close()
    if 'audio' in locals():
        audio.terminate()
