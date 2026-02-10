-- RPC to fetch item_value_history for a list of item IDs in one request (IDs in body, not URL).
-- Only returns rows for items owned by auth.uid(). p_days null = no date filter.
CREATE OR REPLACE FUNCTION get_item_value_history(p_item_ids uuid[], p_days int DEFAULT NULL)
RETURNS TABLE (item_id uuid, recorded_at timestamptz, unit_value numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT h.item_id, h.recorded_at, h.unit_value
  FROM item_value_history h
  WHERE h.item_id = ANY(p_item_ids)
    AND EXISTS (SELECT 1 FROM items i WHERE i.id = h.item_id AND i.user_id = auth.uid())
    AND (p_days IS NULL OR h.recorded_at >= (current_timestamp - (p_days || ' days')::interval))
  ORDER BY h.recorded_at ASC;
$$;
