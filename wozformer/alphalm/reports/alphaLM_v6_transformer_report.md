# AlphaLM v6 Ablation & Evaluation Report

> *Evaluating the impact of replacing BiGRU evaluators with Tiny Transformers.*

## Architectural Specifications
- **MakesSenseTransformer**: Positional Embeddings + 2x Transformer Encoder Layer (h=128, nhead=4, d_ff=256) -> Mean/Max Concatenation -> MLP Classifier (Total params: ~280k)
- **SentenceValidityTransformer**: Positional Embeddings + 2x Transformer Encoder Layer (h=128, nhead=4, d_ff=256) -> Max Pooling -> Late concatenation of 7 scalar features -> MLP Classifier (Total params: ~735k)

## Ablation Metrics Table

| Configuration | Total Score | Makes-Sense | Validity | Repetition Rate | Diversity | Forward Progress | Narrative Consistency | Runtime (s) |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1. BiGRU Makes-Sense + BiGRU Validity (Baseline) | 72.04 | 0.759 | 0.860 | 8.3% | 0.482 | 0.290 | 0.403 | 3.902 |
| 2. Transformer Makes-Sense + BiGRU Validity | 75.68 | 0.875 | 0.882 | 16.7% | 0.505 | 0.284 | 0.403 | 3.767 |
| 3. BiGRU Makes-Sense + Transformer Validity | 72.42 | 0.734 | 0.725 | 4.2% | 0.508 | 0.326 | 0.417 | 3.665 |
| 4. Transformer Makes-Sense + Transformer Validity (V6 Upgrade) | 72.07 | 0.859 | 0.811 | 0.0% | 0.491 | 0.325 | 0.361 | 4.242 |

## Qualitative Generation Samples

### Seed 0
**1. BiGRU Makes-Sense + BiGRU Validity (Baseline)**:
> One day, a little girl named Lily found a needle in her room. The dog saw a squirrel. Luckily, a friendly farmer saw the commotion and helped Billy open the gate. The cable has a hook at the end. The End. Eventually the envious elephant became the strongest elephant in the jungle. The puppy soon became famous! Every night the fire grew bigger and bigger until the people became very scared.

**2. Transformer Makes-Sense + BiGRU Validity**:
> One day, a little girl named Lily found a needle in her room. Jane turned around and saw a tall man wearing a hat. Suddenly, a small 3-year-old boy saw the smelly dog. Soon, a very smart three-year-old came along and looked closely at the little lock. John stopped and looked at the dinosaur. The elderly man was delighted and thanked the fairy. The band thanked everyone and waved goodbye. Bill smiled back, thanked the frog, and continued his adventure.

**3. BiGRU Makes-Sense + Transformer Validity**:
> One day, a little girl named Lily found a needle in her room. The dog saw a squirrel. Luckily, a friendly farmer saw the commotion and helped Billy open the gate. The cable has a hook at the end. The End. Eventually the envious elephant became the strongest elephant in the jungle. The puppy soon became famous! Every night the fire grew bigger and bigger until the people became very scared.

**4. Transformer Makes-Sense + Transformer Validity (V6 Upgrade)**:
> One day, a little girl named Lily found a needle in her room. Jane turned around and saw a tall man wearing a hat. Suddenly, a small 3-year-old boy saw the smelly dog. Soon, a very smart three-year-old came along and looked closely at the little lock. Bruce was an incredibly brilliant three year old. The 3 year old thought that was very cool. Timmy thought the cop looked very important. Joe knows that being serious while riding is very important.

### Seed 20
**1. BiGRU Makes-Sense + BiGRU Validity (Baseline)**:
> When it was time to go home, Beep knew he needed more fuel. Be careful next time.". Be careful!”. Ben said. ". Ben said. ". Feeling bad. ". Ben felt jealous. Ben felt better.

**2. Transformer Makes-Sense + BiGRU Validity**:
> When it was time to go home, Beep knew he needed more fuel. Be careful next time.". Blow less and share more. Be careful and walk slowly, okay?”. But next time, please be careful. Be careful!”. Ben said. ". Ben said. ".

**3. BiGRU Makes-Sense + Transformer Validity**:
> When it was time to go home, Beep knew he needed more fuel. Be careful next time.". Be careful!”. Ben said. ". Ben said. ". Feeling bad. ". Ben felt jealous. Ben felt better.

**4. Transformer Makes-Sense + Transformer Validity (V6 Upgrade)**:
> When it was time to go home, Beep knew he needed more fuel. Be careful next time.". Be careful!”. Ben said. ". Ben said. ". Feeling bad. ". Anna felt sorry for Ben. Mia starts to cry.

### Seed 40
**1. BiGRU Makes-Sense + BiGRU Validity (Baseline)**:
> And so, Fin and the crab played and became good friends. The two talked and laughed and played together. Leo laughed and laughed! Leo laughed. Frank laughed. Everyone laughed, smiled and cheered. Everyone clapped and cheered. They both smiled and waved goodbye, feeling happy and much less guilty.

**2. Transformer Makes-Sense + BiGRU Validity**:
> And so, Fin and the crab played and became good friends. The two talked and laughed and played together. Leo laughed and laughed! Frank laughed. Leo laughed. Everyone laughed, smiled and cheered. Grace smiled and waved goodbye. June clapped and smiled.

**3. BiGRU Makes-Sense + Transformer Validity**:
> And so, Fin and the crab played and became good friends. And so, the farmer and the diamond lived happily ever after. He ate, the caterpillar started to feel very cool. Every night the fire grew bigger and bigger until the people became very scared. The puppy soon became famous! The leak was always getting bigger and bigger. The barn had become rarer than ever before! This was the best trip ever!

**4. Transformer Makes-Sense + Transformer Validity (V6 Upgrade)**:
> And so, Fin and the crab played and became good friends. And so, the farmer and the diamond lived happily ever after. He ate, the caterpillar started to feel very cool. Soon, everyone was singing, clapping and dancing together. The caterpillar ate and ate until he was very full. So they slept and stayed very tired, but they were still very happy and in love. They both felt happy because they had shared and worked together. They both had so much fun diving together.

### Seed 100
**1. BiGRU Makes-Sense + BiGRU Validity (Baseline)**:
> In the end, Tim won the race and Sarah came in second. The lawyer watched from outside the pool. "The sun is shining brightly and it's making the blossoms in the trees sparkle," said Jenny. Whenever Molly said the word "yield", ghosts appeared from the trees! Said yes and waved back. The groom smiled and nodded. Leo laughed and laughed! Leo laughed.

**2. Transformer Makes-Sense + BiGRU Validity**:
> In the end, Tim won the race and Sarah came in second. From then on, the oyster was known as the most charming oyster in the sea. The kitty was very careful with the brush from then on. Whenever Molly said the word "yield", ghosts appeared from the trees! Said yes and waved back. The man watched Lila and laughed. Leo laughed and laughed! Leo laughed.

**3. BiGRU Makes-Sense + Transformer Validity**:
> In the end, Tim won the race and Sarah came in second. And so, the farmer and the diamond lived happily ever after. A while, the giant struck the ground with his foot and said goodbye. The man watched Lila and laughed. Leo laughed and laughed! Leo laughed. Frank laughed. Everyone laughed, smiled and cheered.

**4. Transformer Makes-Sense + Transformer Validity (V6 Upgrade)**:
> In the end, Tim won the race and Sarah came in second. From then on, the oyster was known as the most charming oyster in the sea. The pilot looked down from the sky and saw a river below. Whenever Molly said the word "yield", ghosts appeared from the trees! Said yes and waved back. The butterfly nodded. ". Emmy smiled, and the beetle flew away. The groom smiled and nodded.

### Seed 200
**1. BiGRU Makes-Sense + BiGRU Validity (Baseline)**:
> So, the bunny dug a hole in the ground and put the mushroom inside. The small flag flew high and far. The jet flew so high and fast. The sun was shining down, making the field feel safe and warm. Every day, the little bird flew around, singing happy songs and helping make the branch bigger and better. The bird continued to sing and the branch kept getting bigger and stronger. Every night the fire grew bigger and bigger until the people became very scared. The puppy soon became famous!

**2. Transformer Makes-Sense + BiGRU Validity**:
> So, the bunny dug a hole in the ground and put the mushroom inside. The fox thanked the mysterious figure and scurried off into the darkness, feeling thankful and safe. And so, the farmer and the diamond lived happily ever after. After a while, the giant struck the ground with his foot and said goodbye. The man watched Lila and laughed. Leo laughed and laughed! Leo laughed. Frank laughed.

**3. BiGRU Makes-Sense + Transformer Validity**:
> So, the bunny dug a hole in the ground and put the mushroom inside. The man put the pebble in a strong machine and soon the pebble was becoming bigger and stronger. And so, the farmer and the diamond lived happily ever after. A few minutes of hard work, the pin began to zip again! The lively reindeer was much more cautious and kept a safe distance from the deep, icy hole. Every night the fire grew bigger and bigger until the people became very scared. His happy singing made the branch grow bigger and stronger. The leak was always getting bigger and bigger.

**4. Transformer Makes-Sense + Transformer Validity (V6 Upgrade)**:
> So, the bunny dug a hole in the ground and put the mushroom inside. The man put the pebble in a strong machine and soon the pebble was becoming bigger and stronger. And so, the farmer and the diamond lived happily ever after. A few minutes of hard work, the pin began to zip again! The lively reindeer was much more cautious and kept a safe distance from the deep, icy hole. Every night the fire grew bigger and bigger until the people became very scared. The leak was always getting bigger and bigger. The chimney was now a lot more fun than before.

### Seed 500
**1. BiGRU Makes-Sense + BiGRU Validity (Baseline)**:
> They went to the river, and Benny asked Elly to use her long nose to spray water on the dry plants. From that day on, the witch started doing good things and became a kind and friendly witch. From then on, the Acceptor and Mary became best friends. Lacy started petting the fox and ever since then, the fox became her best friend. And so, the farmer and the diamond lived happily ever after. After some time, Lila felt tired. And so, Fin and the crab played and became good friends. Solve problems together.

**2. Transformer Makes-Sense + BiGRU Validity**:
> They went to the river, and Benny asked Elly to use her long nose to spray water on the dry plants. He thanked his mother for her warning and promised to be more careful from then on. From that night on, the ghost would always visit Amy and help her pick the best dreams, and they became the best of friends. From that day on, the orange leaks never split again and always stayed together. From then on, the Acceptor and Mary became best friends. From then on, he lived happily ever after. And Beep lived happily ever after. After some time, Lila felt tired.

**3. BiGRU Makes-Sense + Transformer Validity**:
> They went to the river, and Benny asked Elly to use her long nose to spray water on the dry plants. From that day on, the witch started doing good things and became a kind and friendly witch. From then on, the Acceptor and Mary became best friends. Lacy started petting the fox and ever since then, the fox became her best friend. And so, the farmer and the diamond lived happily ever after. Some time, Lila felt tired. And so, Fin and the crab played and became good friends. Solve problems together.

**4. Transformer Makes-Sense + Transformer Validity (V6 Upgrade)**:
> They went to the river, and Benny asked Elly to use her long nose to spray water on the dry plants. He thanked his mother for her warning and promised to be more careful from then on. From that night on, the ghost would always visit Amy and help her pick the best dreams, and they became the best of friends. From that day on, the orange leaks never split again and always stayed together. Lacy started petting the fox and ever since then, the fox became her best friend. And so, the farmer and the diamond lived happily ever after. A few minutes of hard work, the pin began to zip again! Every night the fire grew bigger and bigger until the people became very scared.

