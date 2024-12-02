const wrapper = document.getElementById("wrapper");

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

const uniqueRand = (min, max, prev) => {
  let next = prev;
  
  while(prev === next) next = rand(min, max);
  
  return next;
}

const combinations = [
  { configuration: 1, roundness: 1 },
  { configuration: 1, roundness: 2 },
  { configuration: 1, roundness: 4 },
  { configuration: 2, roundness: 2 },
  { configuration: 2, roundness: 3 },

];

let prev = 0;

setInterval(() => {
  const index = uniqueRand(0, combinations.length - 1, prev),
        combination = combinations[index];
  
  wrapper.dataset.configuration = combination.configuration;
  wrapper.dataset.roundness = combination.roundness;
  
  prev = index;
},1000);

document.getElementById("aiArtCreate").addEventListener("click", function() {
  
  if(localStorage.getItem("ElixpoAIUser") !== null) {
      redirectTo("src/create");
  }
  else 
  {
      redirectTo("src/auth");
  }
  
});



document.getElementById("aiArtCreateNavBar").addEventListener("click", function() {
  
  if(localStorage.getItem("ElixpoAIUser") !== null) {
      redirectTo("src/create");
  }
  else 
  {
      redirectTo("src/auth");
  }
  
});

document.getElementById("followWhatsapp").addEventListener("click", () => {

location.href = "https://www.instagram.com/elixpo_ai/";
})