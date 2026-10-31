export const WORKFLOW_MESSAGE_PREFIX = 'COZI_WORKFLOW_V1:';
export function parseWorkflowMessage(body) {
    if (!body.startsWith(WORKFLOW_MESSAGE_PREFIX))
        return null;
    try {
        const value = JSON.parse(body.slice(WORKFLOW_MESSAGE_PREFIX.length));
        return value && ['form', 'confirmation', 'requirement', 'execution'].includes(value.kind) &&
            ['entityId', 'title', 'description'].every(key => typeof value[key] === 'string') ? value : null;
    }
    catch {
        return null;
    }
}
export function isFieldVisible(field, answers) {
    const rule = field.condition;
    if (!rule)
        return true;
    const value = answers[rule.fieldKey];
    if (value === undefined)
        return false;
    if (rule.operator === 'notEmpty')
        return value !== null && value !== '';
    return rule.operator === 'equals' ? value === rule.value : value !== rule.value;
}
/** Omit hidden answers from submitted/confirmed content; defaults never replace existing answers. */
export function prepareFormAnswers(fields, answers) {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers))
        return answers;
    const result = {};
    for (const field of fields) {
        if (['section', 'paragraph', 'divider'].includes(field.kind) || !isFieldVisible(field, answers))
            continue;
        const value = answers[field.key] ?? field.defaultValue;
        if (value === undefined || value === '')
            continue;
        result[field.key] = field.kind === 'repeat' && Array.isArray(value)
            ? value.map(item => prepareFormAnswers(field.children || [], item)) : value;
    }
    return result;
}
export function formatAnswer(value) {
    if (value === null || value === undefined || value === '')
        return '未填写';
    if (typeof value === 'boolean')
        return value ? '是' : '否';
    if (Array.isArray(value))
        return value.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join('、');
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
export function formatFieldAnswer(field, value) {
    if (!field || value === undefined || value === null || value === '')
        return formatAnswer(value);
    if (field.options?.length) {
        const label = (item) => field.options.find(option => option.value === item)?.label || formatAnswer(item);
        return Array.isArray(value) ? value.map(label).join('、') : label(value);
    }
    if (field.kind === 'image' || field.kind === 'file')
        return `已上传${field.kind === 'image' ? '图片' : '文件'}${Array.isArray(value) ? ` ${value.length} 个` : ''}`;
    if (field.kind === 'repeat' && Array.isArray(value))
        return value.map((row, index) => `第 ${index + 1} 项：${(field.children || []).filter(child => !['section', 'paragraph', 'divider'].includes(child.kind) && isFieldVisible(child, row)).map(child => `${child.label}：${formatFieldAnswer(child, row[child.key])}`).join('；')}`).join('\n');
    return formatAnswer(value);
}
export function requirementChanges(previous, next) {
    if (!previous)
        return [];
    function entries(content) {
        const result = new Map();
        for (const key of ['title', 'category', 'platform', 'deadline', 'requiresPsd', 'originalRequirements'])
            result.set(key, { label: ({ title: '项目名称', category: '交付类型', platform: '平台', deadline: '交付时间', requiresPsd: '源文件要求', originalRequirements: '原始需求' })[key], value: content[key] });
        for (const source of content.sources) {
            for (const field of source.fields) {
                if (['section', 'divider', 'paragraph'].includes(field.kind))
                    continue;
                result.set(`${source.formId}:${field.key}`, { label: `${source.title} / ${field.label}`, value: source.answers[field.key], field });
            }
        }
        return result;
    }
    const before = entries(previous);
    const after = entries(next);
    return [...new Set([...before.keys(), ...after.keys()])].filter(key => JSON.stringify(before.get(key)?.value) !== JSON.stringify(after.get(key)?.value))
        .map(key => ({ label: after.get(key)?.label || before.get(key).label, before: formatFieldAnswer(before.get(key)?.field, before.get(key)?.value), after: formatFieldAnswer(after.get(key)?.field, after.get(key)?.value) }));
}
export function workflowPlanError(plan) {
    const ids = new Set(plan.nodes.map(node => node.id));
    if (ids.size !== plan.nodes.length)
        return '工作流节点 ID 重复';
    if (new Set(plan.edges.map(edge => edge.id)).size !== plan.edges.length)
        return '工作流连线 ID 重复';
    const adjacency = new Map(plan.nodes.map(node => [node.id, []]));
    for (const edge of plan.edges) {
        if (!ids.has(edge.source) || !ids.has(edge.target))
            return '连线引用了不存在的节点';
        if (edge.source === edge.target)
            return '节点不能连接自身';
        adjacency.get(edge.source).push(edge.target);
    }
    const visiting = new Set();
    const visited = new Set();
    function cyclic(id) {
        if (visiting.has(id))
            return true;
        if (visited.has(id))
            return false;
        visiting.add(id);
        if (adjacency.get(id).some(cyclic))
            return true;
        visiting.delete(id);
        visited.add(id);
        return false;
    }
    if (plan.nodes.some(node => cyclic(node.id)))
        return '工作流存在循环依赖';
    for (const node of plan.nodes) {
        for (const binding of node.inputBindings) {
            if (binding.sourceNodeId && (!ids.has(binding.sourceNodeId) || !plan.edges.some(edge => edge.source === binding.sourceNodeId && edge.target === node.id)))
                return '输入绑定必须来自已连接的前置节点';
            if (Boolean(binding.requirementPath) === Boolean(binding.sourceNodeId))
                return '输入绑定必须指定需求路径或前置节点之一';
        }
    }
    return null;
}
