import { useEffect, useState } from 'react'

import { supabase } from '@/lib/supabase'

type SchemaCheck = {
  key: string
  query: string
}

type SchemaIssue = {
  key: string
  message: string
}

const REQUIRED_SCHEMA_CHECKS: SchemaCheck[] = [
  { key: 'boards', query: 'id,name,sort_order,is_default,created_by' },
  { key: 'task_assignees', query: 'task_id,assignee_id,created_at' },
  { key: 'notifications', query: 'id,recipient_id,actor_id,task_id,type,title,message,read_at,created_at' },
  { key: 'projects', query: 'id,name,key,status,description,owner_id,start_date,end_date,created_by' },
  { key: 'tasks', query: 'id,title,status,board_column,assigned_to,created_by,due_at,start_at,completed_at' },
  { key: 'profiles', query: 'id,full_name,email' },
]

export function useSchemaHealth() {
  const [loading, setLoading] = useState(true)
  const [issues, setIssues] = useState<SchemaIssue[]>([])

  useEffect(() => {
    let cancelled = false

    void Promise.all(
      REQUIRED_SCHEMA_CHECKS.map(async (check) => {
        const { error } = await supabase.from(check.key).select(check.query).limit(1)
        if (!error) return null
        return {
          key: check.key,
          message: error.message,
        } satisfies SchemaIssue
      }),
    ).then((results) => {
      if (cancelled) return
      setIssues(results.filter((result): result is SchemaIssue => Boolean(result)))
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return {
    loading,
    hasIssues: issues.length > 0,
    issues,
  }
}
