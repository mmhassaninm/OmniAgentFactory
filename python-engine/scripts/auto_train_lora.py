#!/usr/bin/env python3
"""
🧬 VibeLab Auto-LoRA Fine-Tuning Script
========================================
Performs lightweight LoRA fine-tuning on the local LLM using
interaction data collected in dataset.jsonl.

Optimized for 8GB VRAM using 4-bit quantization (BitsAndBytes).

Usage:
    python auto_train_lora.py

Dependencies:
    pip install torch transformers peft datasets bitsandbytes accelerate
    # OR for Unsloth (faster, less VRAM):
    # pip install unsloth
"""

import os
import sys
import json
import logging
from pathlib import Path
from datetime import datetime

# ─── Paths ───
SCRIPT_DIR = Path(__file__).parent.resolve()
TRAINING_DIR = SCRIPT_DIR.parent / "ai_training"
DATASET_FILE = TRAINING_DIR / "dataset.jsonl"
OUTPUT_DIR = TRAINING_DIR / "latest_adapter"
LOG_FILE = TRAINING_DIR / "training_log.txt"

# ─── Config ───
BASE_MODEL = os.environ.get("VIBELAB_BASE_MODEL", "Qwen/Qwen2.5-Coder-7B-Instruct")
LORA_R = 16
LORA_ALPHA = 32
LORA_DROPOUT = 0.05
LEARNING_RATE = 2e-4
NUM_EPOCHS = 3
MAX_SEQ_LEN = 2048
BATCH_SIZE = 1
GRADIENT_ACCUMULATION = 4

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("AutoLoRA")


def log_to_file(message):
    """Append a timestamped message to the training log."""
    TRAINING_DIR.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"[{datetime.now().isoformat()}] {message}\n")


def validate_dataset():
    """Check that dataset.jsonl exists and has enough entries."""
    if not DATASET_FILE.exists():
        logger.error(f"❌ Dataset not found: {DATASET_FILE}")
        log_to_file("ABORT: dataset.jsonl not found")
        return False

    line_count = 0
    with open(DATASET_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entry = json.loads(line)
                    if "instruction" in entry and "output" in entry:
                        line_count += 1
                except json.JSONDecodeError:
                    continue

    if line_count < 10:
        logger.warning(f"⚠️  Only {line_count} valid entries. Minimum 10 recommended.")
        log_to_file(f"WARNING: Only {line_count} entries in dataset")

    logger.info(f"📊 Dataset validated: {line_count} training entries")
    log_to_file(f"Dataset validated: {line_count} entries")
    return line_count > 0


def try_unsloth_training():
    """Attempt training with Unsloth (fastest, lowest VRAM)."""
    try:
        from unsloth import FastLanguageModel
        from trl import SFTTrainer
        from transformers import TrainingArguments
        from datasets import load_dataset

        logger.info("🚀 Using Unsloth for optimized training...")
        log_to_file("Engine: Unsloth")

        # Load model with 4-bit quantization
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=BASE_MODEL,
            max_seq_length=MAX_SEQ_LEN,
            dtype=None,  # Auto-detect
            load_in_4bit=True,
        )

        # Apply LoRA
        model = FastLanguageModel.get_peft_model(
            model,
            r=LORA_R,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                            "gate_proj", "up_proj", "down_proj"],
            lora_alpha=LORA_ALPHA,
            lora_dropout=LORA_DROPOUT,
            bias="none",
            use_gradient_checkpointing="unsloth",
        )

        # Load dataset
        dataset = load_dataset("json", data_files=str(DATASET_FILE), split="train")

        # Format for Alpaca
        alpaca_template = """### Instruction:
{instruction}

### Input:
{input}

### Response:
{output}"""

        def format_prompt(example):
            return {"text": alpaca_template.format(**example)}

        dataset = dataset.map(format_prompt)

        # Training
        trainer = SFTTrainer(
            model=model,
            tokenizer=tokenizer,
            train_dataset=dataset,
            dataset_text_field="text",
            max_seq_length=MAX_SEQ_LEN,
            args=TrainingArguments(
                per_device_train_batch_size=BATCH_SIZE,
                gradient_accumulation_steps=GRADIENT_ACCUMULATION,
                warmup_steps=5,
                num_train_epochs=NUM_EPOCHS,
                learning_rate=LEARNING_RATE,
                fp16=True,
                logging_steps=1,
                output_dir=str(OUTPUT_DIR),
                optim="adamw_8bit",
                save_strategy="epoch",
            ),
        )

        logger.info("🏋️ Training started...")
        log_to_file("Training started (Unsloth)")
        trainer.train()

        # Save adapter
        model.save_pretrained(str(OUTPUT_DIR))
        tokenizer.save_pretrained(str(OUTPUT_DIR))

        logger.info(f"✅ LoRA adapter saved to: {OUTPUT_DIR}")
        log_to_file(f"SUCCESS: Adapter saved to {OUTPUT_DIR}")
        return True

    except ImportError:
        logger.info("Unsloth not available, falling back to standard PEFT...")
        return False
    except Exception as e:
        logger.error(f"Unsloth training failed: {e}")
        log_to_file(f"Unsloth FAILED: {e}")
        return False


def try_peft_training():
    """Standard PEFT/BitsAndBytes training fallback."""
    try:
        import torch
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            TrainingArguments,
            BitsAndBytesConfig,
        )
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
        from trl import SFTTrainer
        from datasets import load_dataset

        logger.info("🔧 Using standard PEFT + BitsAndBytes 4-bit training...")
        log_to_file("Engine: PEFT + BitsAndBytes")

        # 4-bit quantization config
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )

        # Load model
        logger.info(f"📦 Loading base model: {BASE_MODEL}")
        tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL,
            quantization_config=bnb_config,
            device_map="auto",
            trust_remote_code=True,
        )

        model = prepare_model_for_kbit_training(model)

        # LoRA config
        lora_config = LoraConfig(
            r=LORA_R,
            lora_alpha=LORA_ALPHA,
            lora_dropout=LORA_DROPOUT,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                            "gate_proj", "up_proj", "down_proj"],
            bias="none",
            task_type="CAUSAL_LM",
        )

        model = get_peft_model(model, lora_config)
        model.print_trainable_parameters()

        # Load dataset
        dataset = load_dataset("json", data_files=str(DATASET_FILE), split="train")

        alpaca_template = """### Instruction:
{instruction}

### Input:
{input}

### Response:
{output}"""

        def format_prompt(example):
            return {"text": alpaca_template.format(**example)}

        dataset = dataset.map(format_prompt)

        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        # Training
        trainer = SFTTrainer(
            model=model,
            tokenizer=tokenizer,
            train_dataset=dataset,
            dataset_text_field="text",
            max_seq_length=MAX_SEQ_LEN,
            args=TrainingArguments(
                per_device_train_batch_size=BATCH_SIZE,
                gradient_accumulation_steps=GRADIENT_ACCUMULATION,
                warmup_steps=5,
                num_train_epochs=NUM_EPOCHS,
                learning_rate=LEARNING_RATE,
                fp16=True,
                logging_steps=1,
                output_dir=str(OUTPUT_DIR),
                optim="paged_adamw_8bit",
                save_strategy="epoch",
            ),
        )

        logger.info("🏋️ Training started...")
        log_to_file("Training started (PEFT)")
        trainer.train()

        # Save adapter
        model.save_pretrained(str(OUTPUT_DIR))
        tokenizer.save_pretrained(str(OUTPUT_DIR))

        logger.info(f"✅ LoRA adapter saved to: {OUTPUT_DIR}")
        log_to_file(f"SUCCESS: Adapter saved to {OUTPUT_DIR}")
        return True

    except ImportError as e:
        logger.error(f"❌ Missing dependencies: {e}")
        logger.error("Install with: pip install torch transformers peft datasets bitsandbytes accelerate trl")
        log_to_file(f"ABORT: Missing dependency - {e}")
        return False
    except Exception as e:
        logger.error(f"❌ PEFT training failed: {e}")
        log_to_file(f"PEFT FAILED: {e}")
        return False


def main():
    print("═══════════════════════════════════════════════")
    print("  🧬 VibeLab Auto-LoRA Fine-Tuning Engine v1.0")
    print(f"  📦 Base Model: {BASE_MODEL}")
    print(f"  📊 Dataset: {DATASET_FILE}")
    print(f"  💾 Output: {OUTPUT_DIR}")
    print("═══════════════════════════════════════════════\n")

    log_to_file("=" * 50)
    log_to_file("Auto-LoRA session started")

    # Validate dataset
    if not validate_dataset():
        print("\n🛑 No valid training data. Collect more interactions first.")
        sys.exit(1)

    # Ensure output dir
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Try Unsloth first (optimal), fall back to PEFT
    success = try_unsloth_training()
    if not success:
        success = try_peft_training()

    if success:
        print("\n═══════════════════════════════════════════════")
        print("  ✅ Evolution Complete!")
        print(f"  💾 Adapter: {OUTPUT_DIR}")
        print("  📌 Load in LM Studio by merging the adapter")
        print("═══════════════════════════════════════════════")
        log_to_file("Session complete: SUCCESS")
    else:
        print("\n═══════════════════════════════════════════════")
        print("  ❌ Training failed. Check logs above.")
        print("═══════════════════════════════════════════════")
        log_to_file("Session complete: FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
