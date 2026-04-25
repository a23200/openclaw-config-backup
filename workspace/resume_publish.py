import os
import json
import requests

work_dir = "/Users/mac/.openclaw/workspace/outputs/auto_jimeng_1776522734"
video_url = "https://v3-artist.vlabvod.com/f8832517728dba70a4abdc51730a73ae/69e3aab8/video/tos/cn/tos-cn-v-148450/okSAO65xv4vfxbWuBVmB5XHHgCZfAOHRtp23gQ/?a=4066&ch=0&cr=0&dr=0&er=0&cd=0%7C0%7C0%7C0&br=6266&bt=6266&cs=0&ds=12&ft=5QYTUxhhe6BMyqJr0~VJD12Nzj&mime_type=video_mp4&qs=0&rc=Ozc8OTU5NDQzZjY2ZDhmOUBpM3VxeDRrb3ZzOjczNDM7M0AuNDRjLy1eNS4xNjExLTAvYSNecGFxcWdea2VhLS1kNC9zcw%3D%3D&btag=c0000e00010000&dy_q=1776524441&feature_id=04b16e464b574158bb99cac30ccb1f5e&l=202604182300411921680012034571F5C"
video_path = os.path.join(work_dir, "video.mp4")
final_video_path = os.path.join(work_dir, "final.mp4")
first_frame_path = os.path.join(work_dir, "first_frame.jpg")

print(f"Downloading final video to {final_video_path}...")
r = requests.get(video_url)
with open(final_video_path, 'wb') as f:
    f.write(r.content)

print("\n--- [Stage L] 生成发布配置 ---")
douyin_json_path = os.path.join(work_dir, "douyin_publish.json")
pub_config = {
    "videoPath": final_video_path,
    "title": "只要方向盘在手里，黑暗前方就是早晨",
    "description": "很多时候，生活就像这条看起来没有尽头的隧道。你只能一直开，一直往前开。但请相信，只要方向盘还在自己手里，穿过这片黑暗，前面就是早晨。#情绪 #治愈 #深夜感悟 #即梦",
    "tags": ["情绪", "治愈", "深夜感悟", "即梦", "微电影"],
    "coverPath": first_frame_path
}
with open(douyin_json_path, 'w') as f:
    json.dump(pub_config, f, indent=2, ensure_ascii=False)

print(f"发布配置已生成: {douyin_json_path}")
print("\n--- [Stage M] 自动发布到抖音 ---")
publish_cmd = f"node /Users/mac/.agents/skills/douyin-creator-tools/src/publish-douyin-video.mjs {douyin_json_path} --keep-open"
print(f"即将执行发布: {publish_cmd}")
os.system(publish_cmd)
print("Finished!")
