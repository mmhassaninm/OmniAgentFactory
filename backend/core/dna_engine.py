"""
OmniBot — Agent DNA System

Each agent has a "DNA" dict of behavioral parameters.
When 2 top-performing agents are "bred", their DNA is combined with mutation,
creating genuinely novel agents instead of just iterating on one lineage.
"""

import random


DEFAULT_DNA = {
    "risk_tolerance": 0.5,       # 0=conservative, 1=aggressive
    "exploration_rate": 0.3,     # how often to try novel approaches
    "memory_depth": 5,           # how many past iterations to consider
    "creativity_bias": 0.5,      # weight given to unconventional solutions
    "speed_vs_depth": 0.5,       # 0=fast/shallow, 1=slow/deep
    "tool_usage_preference": 0.5, # 0=avoid tools, 1=use tools heavily
}


def breed_agents(dna_a: dict, dna_b: dict, mutation_rate: float = 0.1) -> dict:
    """
    Combine two agent DNAs using uniform crossover + gaussian mutation.
    The child inherits traits from both parents with random mutation.
    """
    child_dna = {}
    for trait in DEFAULT_DNA:
        # Uniform crossover: 50% chance to inherit from each parent
        child_dna[trait] = dna_a.get(trait, 0.5) if random.random() < 0.5 else dna_b.get(trait, 0.5)
        # Gaussian mutation
        if random.random() < mutation_rate:
            mutation = random.gauss(0, 0.1)
            child_dna[trait] = max(0.0, min(1.0, child_dna[trait] + mutation))
    return child_dna


def dna_to_prompt_modifiers(dna: dict) -> str:
    """Convert DNA values to natural language instructions for the LLM."""
    modifiers = []

    if dna.get("risk_tolerance", 0.5) > 0.7:
        modifiers.append("Be bold and try unconventional approaches.")
    elif dna.get("risk_tolerance", 0.5) < 0.3:
        modifiers.append("Be conservative and stick to proven methods.")

    if dna.get("exploration_rate", 0.3) > 0.6:
        modifiers.append("Explore diverse solution strategies before converging.")

    if dna.get("creativity_bias", 0.5) > 0.7:
        modifiers.append("Prioritize creative and novel solutions over standard ones.")

    if dna.get("speed_vs_depth", 0.5) > 0.7:
        modifiers.append("Prefer thorough, comprehensive analysis over quick answers.")

    return " ".join(modifiers)
