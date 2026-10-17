from transformers import (
    T5Tokenizer,
    T5ForConditionalGeneration,
    Seq2SeqTrainingArguments,
    Seq2SeqTrainer,
    DataCollatorForSeq2Seq
)
import pandas as pd
from datasets import Dataset
import torch

# Load dataset
df = pd.read_csv("/kaggle/input/emojivstarget/mt5_training_data.csv")
df = df.dropna(subset=["input_text", "target_text"])
df["input_text"] = "Translate the emoji sentence to plain English: " + df["input_text"]
final_df = df[["input_text", "target_text"]]
final_df.to_csv("/kaggle/working/final_emoji_translation_dataset.csv", index=False)
print("✅ Final dataset is ready with", len(final_df), "samples.")

emoji_ds = Dataset.from_pandas(final_df)
emoji_ds = emoji_ds.train_test_split(test_size=0.2)

# Tokenizer & model
model_name = "t5-small"  # Switched to a smaller model
tokenizer = T5Tokenizer.from_pretrained(model_name)
model = T5ForConditionalGeneration.from_pretrained(model_name)

# Tokenization function
max_input_length = 64
max_target_length = 64

def preprocess_function(example):
    model_inputs = tokenizer(
        example["input_text"], max_length=max_input_length, padding="max_length", truncation=True
    )
    labels = tokenizer(
        example["target_text"], max_length=max_target_length, padding="max_length", truncation=True
    )
    model_inputs["labels"] = labels["input_ids"]
    return model_inputs

# Tokenize the dataset
tokenized_ds = emoji_ds.map(preprocess_function, batched=True)

# Training setup
training_args = Seq2SeqTrainingArguments(
    output_dir="/kaggle/working/t5-emoji-model",
    do_eval=True,
    save_strategy="epoch",
    eval_strategy="epoch",
    learning_rate=3e-5,  # Reduced learning rate
    per_device_train_batch_size=2,  # You can try 2 if GPU allows, otherwise keep at 1
    per_device_eval_batch_size=2,
    gradient_accumulation_steps=4,
    weight_decay=0.01,
    save_total_limit=2,
    num_train_epochs=4,  # Increased to 4 epochs
    fp16=True,
    logging_dir="/kaggle/working/logs",
    load_best_model_at_end=True,
    metric_for_best_model="loss",
    report_to="none",
    gradient_checkpointing=True,
)

data_collator = DataCollatorForSeq2Seq(tokenizer=tokenizer, model=model)

trainer = Seq2SeqTrainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_ds["train"],
    eval_dataset=tokenized_ds["test"],
    tokenizer=tokenizer,
    data_collator=data_collator,
)

# Start training
print("🚀 Training started...")
trainer.train()

# Save model
trainer.save_model("/kaggle/working/t5-emoji-model-final")
tokenizer.save_pretrained("/kaggle/working/t5-emoji-model-final")
