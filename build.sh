cd front
ng build 
docker build -t robotito_front .
docker tag robotito_front chuchip/robotito_front:latest
docker push chuchip/robotito_front:latest

cd ../back
docker build -t robotito_back -f Dockerfile-light .
docker tag robotito_back chuchip/robotito_back:latest
docker push chuchip/robotito_back:latest
