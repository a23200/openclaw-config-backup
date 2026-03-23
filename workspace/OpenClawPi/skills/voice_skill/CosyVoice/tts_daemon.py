import sys
import os
import json
import socket
import threading
import numpy as np
sys.path.append('third_party/Matcha-TTS')
from cosyvoice.cli.cosyvoice import AutoModel
import torchaudio

# ====================== 单例模型（只加载一次）======================
class CosyVoiceModel:
    _instance = None
    _sample_rate = None

    @classmethod
    def get(cls):
        if cls._instance is None:
            print("[TTS 守护进程] 首次加载 CosyVoice3 模型...")
            cls._instance = AutoModel(model_dir='pretrained_models/Fun-CosyVoice3-0.5B')
            cls._sample_rate = cls._instance.sample_rate
        return cls._instance, cls._sample_rate

# ====================== 后台服务（修正参数名，匹配官方调用）======================
class TTSServer:
    def __init__(self, host='127.0.0.1', port=9999):
        self.host = host
        self.port = port
        self.model, self.sample_rate = CosyVoiceModel.get()
        self.default_prompt_wav = "./asset/zero_shot_prompt.wav"

    def generate_audio(self, params):
        """
        严格匹配 CosyVoice3 官方参数名和调用方式
        :param params: 包含调用参数的字典
        :return: (audio_np, sample_rate) 或 (None, error_msg)
        """
        mode = params.get('mode', 'zero_shot')
        content_text = params.get('content_text', '')  # 要合成的核心文本
        prompt_text = params.get('prompt_text', '')    # 提示词/指令文本
        prompt_wav = params.get('prompt_wav', self.default_prompt_wav)

        try:
            # 1. Zero-shot 模式（严格匹配官方调用：content_text, prompt_text, prompt_wav）
            if mode == 'zero_shot':
                gen = self.model.inference_zero_shot(
                    content_text,  # 第一个参数：要合成的文本（官方无keyword，位置传参）
                    prompt_text,   # 第二个参数：提示词
                    prompt_wav,    # 第三个参数：参考音频
                    stream=False
                )
            # 2. 细粒度控制（cross_lingual：只有prompt_text和prompt_wav两个参数）
            elif mode == 'cross_lingual':
                gen = self.model.inference_cross_lingual(
                    prompt_text,  # 包含文本+控制符（如[breath]）
                    prompt_wav,
                    stream=False
                )
            # 3. 指令控制（instruct2：content_text + instruct_text + prompt_wav）
            elif mode == 'instruct2':
                gen = self.model.inference_instruct2(
                    content_text,  # 要合成的文本
                    prompt_text,   # 指令提示词（如“用广东话表达”）
                    prompt_wav,
                    stream=False
                )
            else:
                return None, f"不支持的模式：{mode}，支持的模式：zero_shot/cross_lingual/instruct2"

            # 提取音频张量（和官方示例一致）
            for i, res in enumerate(gen):
                audio_tensor = res['tts_speech'].squeeze().cpu().numpy()
                return audio_tensor, self.sample_rate

            return None, "未生成任何音频数据"
        except Exception as e:
            return None, f"生成失败：{str(e)}"

    def handle_client(self, client_socket):
        """处理单个客户端请求"""
        try:
            # 接收客户端数据（先收长度，再收内容）
            len_data = client_socket.recv(4)
            if not len_data:
                return
            data_len = int.from_bytes(len_data, byteorder='big')
            
            res_data = b''
            while len(res_data) < data_len:
                chunk = client_socket.recv(min(data_len - len(res_data), 4096))
                if not chunk:
                    break
                res_data += chunk
            
            # 解析请求参数
            req = json.loads(res_data.decode('utf-8'))
            
            # 生成音频
            audio_np, result = self.generate_audio(req)
            if audio_np is not None:
                # 序列化音频数据
                audio_str = ','.join(map(str, audio_np))
                response = json.dumps({
                    "status": "success",
                    "sample_rate": result,
                    "audio_data": audio_str,
                    "msg": "音频生成成功"
                }).encode('utf-8')
            else:
                # 生成失败
                response = json.dumps({
                    "status": "failed",
                    "sample_rate": 0,
                    "audio_data": "",
                    "msg": result
                }).encode('utf-8')

            # 发送响应（先长度，后内容）
            client_socket.send(len(response).to_bytes(4, byteorder='big'))
            client_socket.send(response)

        except Exception as e:
            error_res = json.dumps({
                "status": "failed",
                "sample_rate": 0,
                "audio_data": "",
                "msg": f"处理失败：{str(e)}"
            }).encode('utf-8')
            client_socket.send(len(error_res).to_bytes(4, byteorder='big'))
            client_socket.send(error_res)
        finally:
            client_socket.close()

    def start(self):
        """启动后台服务"""
        server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_socket.bind((self.host, self.port))
        server_socket.listen(5)
        print(f"[TTS 守护进程] 已启动，监听 {self.host}:{self.port}")
        print(f"[支持模式] zero_shot / cross_lingual / instruct2")

        while True:
            client_socket, addr = server_socket.accept()
            print(f"[客户端连接] {addr}")
            client_thread = threading.Thread(target=self.handle_client, args=(client_socket,))
            client_thread.daemon = True
            client_thread.start()

if __name__ == "__main__":
    server = TTSServer()
    server.start()
