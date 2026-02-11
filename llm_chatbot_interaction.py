# pylint: disable=line-too-long
"""
Generator module for llm-chatbot-interaction data points.
Extracts the chatbot name (chatgpt, perplexity, claude, gemini) as the secondary identifier.

This allows filtering and grouping LLM interaction data by chatbot platform in PDK reports.

INSTALLATION:
1. Copy this file to: <django_project>/passive_data_kit/generators/llm_chatbot_interaction.py
2. Restart the Django server
3. No migrations needed - PDK auto-discovers generators
"""


def generator_name(identifier):  # pylint: disable=unused-argument
    """Return human-readable name for this generator."""
    return 'LLM Chatbot Interaction'


def extract_secondary_identifier(properties):
    """
    Extract the chatbot name as the secondary identifier.

    The extension sends data with structure:
    {
        'chatbot_name': 'chatgpt',  # or 'perplexity', 'claude', 'gemini'
        'interaction': { ... },
        'data_source': 'extension_chatgpt_capture'
    }

    Returns the chatbot_name value, or None if not present.
    """
    # Primary: Look for chatbot_name at top level
    if 'chatbot_name' in properties:
        return properties['chatbot_name']

    # Fallback: Try to extract from interaction.source if present
    interaction = properties.get('interaction', {})
    if 'source' in interaction:
        return interaction['source']

    # Fallback: Parse from data_source field (e.g., 'extension_chatgpt_capture' -> 'chatgpt')
    data_source = properties.get('data_source', '')
    if data_source.startswith('extension_') and data_source.endswith('_capture'):
        return data_source.replace('extension_', '').replace('_capture', '')

    return None
