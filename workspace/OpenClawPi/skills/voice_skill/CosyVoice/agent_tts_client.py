import sys
import json
import socket
import argparse
import numpy as np
import simpleaudio as sa  # 无需PortAudio，纯Python播放

def play_audio(audio_data, sample_rate):
    """纯Python播放音频（兼容所有系统）"""
    try:
        # 格式转换：float32(-1~1) → int16(-32767~32767)
        audio_int = (audio_data * 32767).astype(np.int16)
        print(f"🎵 开始播放语音（采样率：{sample_rate}）...")
        
        # 播放音频
        play_obj = sa.play_buffer(audio_int, 1, 2, sample_rate)
        play_obj.wait_done()  # 等待播放完成
        print("🎵 播放结束")
        return True
    except Exception as e:
        print(f"❌ 播放失败：{e}")
        return False

def call_tts_skill(params):
    """客户端：请求后台生成音频并播放"""
    host = '127.0.0.1'
    port = 9999

    # 创建客户端socket
    client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        client_socket.connect((host, port))
        
        # 序列化请求参数并发送（先长度，后内容）
        req_data = json.dumps(params).encode('utf-8')
        client_socket.send(len(req_data).to_bytes(4, byteorder='big'))
        client_socket.send(req_data)
        
        # 接收响应长度
        len_data = client_socket.recv(4)
        if not len_data:
            print("❌ 未收到响应")
            return False
        data_len = int.from_bytes(len_data, byteorder='big')
        
        # 接收完整响应
        res_data = b''
        while len(res_data) < data_len:
            chunk = client_socket.recv(min(data_len - len(res_data), 4096))
            if not chunk:
                break
            res_data += chunk
        
        # 解析响应
        res = json.loads(res_data.decode('utf-8'))
        if res["status"] == "success":
            # 还原音频数据
            sample_rate = res["sample_rate"]
            audio_data = np.array(list(map(float, res["audio_data"].split(','))), dtype=np.float32)
            # 播放音频
            return play_audio(audio_data, sample_rate)
        else:
            print(f"❌ TTS 生成失败：{res['msg']}")
            return False

    except ConnectionRefusedError:
        print("❌ 请先启动 TTS 后台守护进程：python tts_daemon.py")
        return False
    except Exception as e:
        print(f"❌ 调用失败：{e}")
        return False
    finally:
        client_socket.close()

def main():
    # 解析终端命令行参数（严格匹配官方示例格式）
    parser = argparse.ArgumentParser(description='CosyVoice3 TTS 终端调用工具（官方示例格式）')
    parser.add_argument('--mode', required=True, choices=['zero_shot', 'cross_lingual', 'instruct2'],
                        help='TTS模式：zero_shot(基础) / cross_lingual(细粒度/多语言) / instruct2(指令控制)')
    parser.add_argument('--content_text', required=False, 
                        help='核心合成文本（zero_shot/instruct2模式必填，cross_lingual模式无效）')
    parser.add_argument('--prompt_text', required=True, 
                        help='提示词文本（严格匹配官方格式：包含You are a helpful assistant.<|endofprompt|>前缀）')
    parser.add_argument('--prompt_wav', default='./asset/zero_shot_prompt.wav', 
                        help='参考音频路径（默认：./asset/zero_shot_prompt.wav）')
    
    args = parser.parse_args()
    
    # 校验参数（cross_lingual模式不需要content_text，zero_shot/instruct2必填）
    if args.mode in ['zero_shot', 'instruct2'] and not args.content_text:
        parser.error(f"--mode={args.mode} 模式下必须指定 --content_text 参数")
    
    # 构造调用参数（严格匹配官方示例的参数传入格式）
    params = {
        "mode": args.mode,
        "content_text": args.content_text if args.content_text else "",
        "prompt_text": args.prompt_text,
        "prompt_wav": args.prompt_wav
    }
    
    # 调用TTS服务并播放
    call_tts_skill(params)

if __name__ == "__main__":
    main()

