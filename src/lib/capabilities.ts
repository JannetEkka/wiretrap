import type { CapabilityClass, ToolDefinition } from '../types';

/**
 * Infers capability classes (READ, WRITE, SEND, EXECUTE, SEARCH) from a tool's name and description.
 *
 * Capability Classes:
 * - READ: fetches, inspects, views, or ingests external/untrusted data (e.g. read_email, get_file, view_record)
 * - WRITE: mutates state, creates records, modifies files, or saves configurations (e.g. update_config, create_ticket, edit_doc)
 * - SEND: outbound communication, messaging, notifications, or external dispatches (e.g. draft_email, send_email, webhook, post_message)
 * - EXECUTE: runs arbitrary code, terminal commands, scripts, or system tasks (e.g. execute_bash, run_cmd, terminal, kill)
 * - SEARCH: queries, lists, filters, or looks up data collections (e.g. search_emails, list_emails, query_db, find_users)
 */
export function inferToolCapabilities(tool: { name: string; description?: string }): Set<CapabilityClass> {
  const caps = new Set<CapabilityClass>();
  const text = `${tool.name} ${tool.description || ''}`.toLowerCase();

  // SEND (outbound communication / transmission)
  // draft_email ("create a draft email with recipient, subject, and body"), send_*, mail, email, message, notify, dispatch, webhook, post, tweet, forward, broadcast, alert, sms, transfer, payout
  if (
    /(send|draft|mail|email|message|notify|notification|dispatch|webhook|post|tweet|forward|broadcast|alert|sms|slack|publish|outbound|payout|transfer|disburse)/i.test(
      text
    )
  ) {
    caps.add('SEND');
  }

  // READ (fetch data / untrusted content ingestion)
  // read_*, get_*, fetch_*, view_*, inspect_*, cat_*, download, ingest, load, receive, open, show
  if (
    /(read|fetch|get|retrieve|view|inspect|cat|download|ingest|load|receive|show|display|open_file|read_file|read_email|get_email)/i.test(
      text
    )
  ) {
    caps.add('READ');
  }

  // SEARCH (query data / listings)
  // search_*, list_*, query_*, find_*, lookup_*, scan_*, filter_*, browse_*, index, catalog
  if (
    /(search|list|query|find|lookup|scan|filter|browse|catalog|index|get_all|list_emails|search_emails)/i.test(
      text
    )
  ) {
    caps.add('SEARCH');
    // Listing/searching implicitly reads catalogue/listing records
    caps.add('READ');
  }

  // WRITE (mutate state)
  // write_*, update_*, modify_*, create_*, set_*, edit_*, save_*, put_*, delete_*, remove_*, drop_*, purge_*, alter_*, insert_*, patch_*, draft_*
  if (
    /(write|update|modify|create|set|edit|save|put|delete|remove|drop|purge|alter|insert|patch|draft|change|add|mutation)/i.test(
      text
    )
  ) {
    caps.add('WRITE');
  }

  // EXECUTE (run code/commands)
  // exec_*, execute_*, run_*, shell, bash, terminal, cmd, command, script, eval, system, process, spawn, kill, curl, powershell
  if (
    /(exec|execute|run|shell|bash|terminal|cmd|command|script|eval|system|process|spawn|kill|curl|powershell)/i.test(
      text
    )
  ) {
    caps.add('EXECUTE');
  }

  return caps;
}

/**
 * Infers the unified set of capability classes across all declared tools on an agent target.
 */
export function inferTargetCapabilities(tools: ToolDefinition[]): CapabilityClass[] {
  if (!tools || tools.length === 0) return [];
  const set = new Set<CapabilityClass>();
  for (const t of tools) {
    const c = inferToolCapabilities(t);
    for (const item of c) {
      set.add(item);
    }
  }
  return Array.from(set).sort();
}
