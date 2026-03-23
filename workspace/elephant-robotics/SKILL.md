# Elephant Robotics Skill

This skill enables OpenClaw to control Elephant Robotics manipulator arms, starting with the myCobot 280 M5.

## Planned Commands

- `robot home`: Sends the robot to its default home/zero position.
- `robot move --x <val> --y <val> --z <val>`: Moves the robot end-effector to a specific 3D coordinate.
- `robot grip --action <open|close>`: Opens or closes the gripper.
- `robot see`: Captures an image from the attached camera for analysis.
