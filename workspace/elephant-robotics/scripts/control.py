
import time
import argparse
import cv2  # Import OpenCV
from pymycobot.mycobot import MyCobot

# --- Connection Details ---
SERIAL_PORT = "/dev/tty.usbserial-54F70030501"
BAUDRATE = 115200
CAMERA_INDEX = 0 # Confirmed that the arm's camera is at index 0

def get_robot():
    """Establishes connection and returns a MyCobot object."""
    print(f"Connecting to myCobot on port {SERIAL_PORT}...")
    try:
        mc = MyCobot(SERIAL_PORT, BAUDRATE)
        if not mc.is_controller_connected():
            print("Error: Robot controller not connected.")
            return None
        print("Connection Successful!")
        return mc
    except Exception as e:
        print(f"Error connecting to robot: {e}")
        return None

def go_home(mc):
    """Sends the robot to its home (zero) position."""
    print("Sending robot to home position...")
    mc.send_angles([0, 0, 0, 0, 0, 0], 50) # Use a moderate speed
    time.sleep(6)
    print("Homing complete.")
    print(f"Current angles: {mc.get_angles()}")

def capture_image():
    """Captures a single frame from the arm's camera and saves it."""
    print(f"Accessing camera at index {CAMERA_INDEX}...")
    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        print(f"Error: Could not open camera at index {CAMERA_INDEX}.")
        return

    ret, frame = cap.read()
    if ret:
        filename = "latest_view.jpg"
        cv2.imwrite(filename, frame)
        print(f"Successfully captured image and saved as {filename}")
    else:
        print("Error: Failed to capture frame from camera.")
    
    cap.release()

def get_current_angles(mc):
    """Gets and prints the robot's current joint angles."""
    angles = mc.get_angles()
    print(f"Current joint angles: {angles}")

def move_to_coords(mc, x, y, z):
    """Moves the robot's end-effector to the given X, Y, Z coordinates."""
    if z < 150.0:
        print(f"⚠️ 拦截警告: Z 轴安全限位触发！目标高度 Z={z} 低于绝对安全线 150.0 毫米。")
        print("为了防止撞击桌面，该移动指令已被系统强制取消。")
        return
        
    print(f"Moving to coordinates: X={x}, Y={y}, Z={z}")
    # We use a fixed downward orientation (rx=180, ry=0, rz=0)
    # Speed is set to a moderate 50, mode 0 is for linear movement.
    mc.send_coords([x, y, z, 180, 0, 0], 50, 0)
    time.sleep(4) # Wait for the movement to complete
    print("Movement complete.")
    current_coords = mc.get_coords()
    print(f"Current coordinates: {current_coords}")

def get_current_coords(mc):
    """Gets and prints the robot's current cartesian coordinates."""
    coords = mc.get_coords()
    print(f"Current coordinates: {coords}")

def operate_gripper(mc, state):
    """Opens or closes the gripper. state: 'open' or 'close'"""
    print(f"Operating gripper: {state}")
    if state == 'open':
        mc.set_gripper_state(0, 50) # 0 indicates open, speed 50
    elif state == 'close':
        mc.set_gripper_state(1, 50) # 1 indicates close, speed 50
    time.sleep(2)
    print("Gripper operation complete.")





def main():
    parser = argparse.ArgumentParser(description="Elephant Robotics myCobot CLI Controller")
    # Making 'command' a required argument
    subparsers = parser.add_subparsers(dest='command', help='Available commands', required=True)

    # Command: home
    parser_home = subparsers.add_parser('home', help='Send the robot to its home position')
    # Unified handler signature: all funcs take args and a potential robot object
    parser_home.set_defaults(func=lambda args, mc: go_home(mc))

    # Command: see
    parser_see = subparsers.add_parser('see', help='Capture an image from the robot camera')
    parser_see.set_defaults(func=lambda args, mc: capture_image())

    # Command: where
    parser_where = subparsers.add_parser('where', help='Get the current joint angles of the robot')
    parser_where.set_defaults(func=lambda args, mc: get_current_angles(mc))

    # Command: coords
    parser_coords = subparsers.add_parser('coords', help='Get the current cartesian coordinates of the robot')
    parser_coords.set_defaults(func=lambda args, mc: get_current_coords(mc))

    # Command: grip
    parser_grip = subparsers.add_parser('grip', help='Operate the gripper (open/close)')
    parser_grip.add_argument('state', choices=['open', 'close'], help='State of the gripper')
    parser_grip.set_defaults(func=lambda args, mc: operate_gripper(mc, args.state))

    # Command: move
    parser_move = subparsers.add_parser('move', help='Move the robot end-effector to a specific coordinate')
    parser_move.add_argument('x', type=float, help='X coordinate')
    parser_move.add_argument('y', type=float, help='Y coordinate')
    parser_move.add_argument('z', type=float, help='Z coordinate')
    parser_move.set_defaults(func=lambda args, mc: move_to_coords(mc, args.x, args.y, args.z))

    args = parser.parse_args()

    # The 'see' command is special as it doesn't require a robot connection
    if args.command == 'see':
        args.func(args, None)  # Pass None for the robot object
        print("Command execution finished.")
        return

    # All other commands require a live robot connection
    mc = get_robot()
    if not mc:
        return

    # Execute the function associated with the chosen command
    args.func(args, mc)
    
    print("Command execution finished.")


if __name__ == "__main__":
    main()
