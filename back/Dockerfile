# Use an NVIDIA CUDA base image
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install Miniconda
RUN apt-get update && apt-get install -y wget curl cmake gcc g++ build-essential ffmpeg espeak && \
    wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh && \
    bash miniconda.sh -b -p /opt/conda && rm miniconda.sh && \
    echo "export PATH=/opt/conda/bin:$PATH" >> ~/.bashrc && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Add Conda to PATH
ENV PATH="/opt/conda/bin:$PATH"

# Install Mamba for faster environment management
RUN conda install -y mamba -c conda-forge && conda clean -tipy

# Set the working directory
WORKDIR /workspace

# Copy your Conda environment file
COPY robotito/back/src/ /workspace/
COPY ./.cache/huggingface/ /root/.cache/huggingface/

COPY robotito/back/environment.yml .

# Create and update the Conda environment
RUN mamba create -n robotito python=3.9 -y && \
    mamba env update --name robotito --file environment.yml && \
    conda clean -tipy

RUN mkdir /workspace/empty_directory
# Activate Conda environment by default in container
RUN echo "source /opt/conda/etc/profile.d/conda.sh" >> ~/.bashrc
RUN echo "conda activate robotito" >> ~/.bashrc

# Expose any required ports (optional)
EXPOSE 5000

CMD ["bash"]
