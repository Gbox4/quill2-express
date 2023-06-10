#!/bin/bash

DOCKERFILE_PATH=$1
IMAGE_NAME=$2
CONTAINER_NAME=$3
OUTPUT_PATH=$4

# Build the Docker image from the specified Dockerfile
docker build -t $IMAGE_NAME -f $DOCKERFILE_PATH .

# Run the Docker container from the built image, with the --rm flag to automatically remove the container after it exits
docker run --name $CONTAINER_NAME $IMAGE_NAME

# Copy any files that were created in the Docker container to the host machine
docker cp $CONTAINER_NAME:/app/. $OUTPUT_PATH

# Delete the Docker container that was run
docker rm $CONTAINER_NAME

# Delete the Docker image that was built
docker rmi $IMAGE_NAME
