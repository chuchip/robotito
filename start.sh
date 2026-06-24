echo "Starting Robotito"
if [ $# -gt 0 ]
then
  internetMode="Y"
  echo "listening in internet"
else
  internetMode="N"
  echo "Listening only in local"
fi
cd back
./start.sh &
sleep 5
cd ../front
if [ $internetMode == 'Y' ];then
  echo "Run on http://robotito.profesor-p.com:4200/"
  ng serve --host 0.0.0.0 &
else
  echo "Run on http://robotito.profesor-p.com:4200/"
  ng serve &
fi
