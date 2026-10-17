eval "$(conda shell.bash hook)"
conda activate robotito2
. ./env.sh

hypercorn src/robotito_ai:app --bind 0.0.0.0:5000 --worker-class asyncio --graceful-timeout 2 # --reload
#python src/robotito_ai.py
