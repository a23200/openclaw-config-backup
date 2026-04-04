import json
from pathlib import Path
import numpy as np

CONFIG_PATH = Path(__file__).resolve().parents[1] / 'config' / 'calibration.example.json'


def load_config():
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def eye2hand(x_im: float, y_im: float):
    cfg = load_config()['calibration']
    p1_im = cfg['image_point_1']
    p1_rb = cfg['robot_point_1']
    p2_im = cfg['image_point_2']
    p2_rb = cfg['robot_point_2']

    x_robot = float(np.interp(x_im, [p1_im[0], p2_im[0]], [p1_rb[0], p2_rb[0]]))
    y_robot = float(np.interp(y_im, [p2_im[1], p1_im[1]], [p2_rb[1], p1_rb[1]]))
    return round(x_robot, 2), round(y_robot, 2)


if __name__ == '__main__':
    print(eye2hand(160, 120))
