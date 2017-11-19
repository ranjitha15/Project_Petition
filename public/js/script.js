var canvas = document.querySelector('#signature');
var ctx = canvas.getContext('2d');
var button = document.querySelector('button[type=submit]');
var input = document.querySelector('input[name = signature]');
var isDrawing = false;
var X = 0;
var Y = 0;
function sign(e){
  if(!isDrawing)
  return;
  ctx.strokeStyle="black";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X,Y);
  ctx.lineTo(e.offsetX,e.offsetY);
  ctx.stroke();
  X = e.offsetX;
  Y = e.offsetY;
}
canvas.addEventListener("mousemove",sign);
canvas.addEventListener("mousedown",function(e){
  isDrawing = true;
  X = e.offsetX;
  Y = e.offsetY;
});
canvas.addEventListener("mouseup",function(){
  isDrawing = false;
});
canvas.addEventListener("mouseout",function(){
  isDrawing = false;
});
button.addEventListener("click",function(){
  input.value = canvas.toDataURL();
});
