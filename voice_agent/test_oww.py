from openwakeword.model import Model
import os

owwModel = Model(wakeword_models=["hey_jarvis"])
print(owwModel.models.keys())
print(os.path.abspath(owwModel.model_paths[0] if owwModel.model_paths else ""))
