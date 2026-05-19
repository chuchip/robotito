cd back
./start.sh &
sleep 5
cd ../front
if [ $# -gt 0 ];then
  echo "Run on http://robotito.profesor-p.com:4200/"
  ng serve --host 0.0.0.0 &
else
  echo "Run on http://robotito.profesor-p.com:4200/"
  ng serve --host 0.0.0.0 &
fi
