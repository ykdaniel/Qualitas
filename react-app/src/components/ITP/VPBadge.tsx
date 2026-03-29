const styles: { [key: string]: string } = {
    H: "bg-rose-100 text-rose-700 border-rose-200 font-bold ring-1 ring-rose-200 shadow-sm",
    W: "bg-amber-100 text-amber-700 border-amber-200 font-bold ring-1 ring-amber-200 shadow-sm",
    R: "bg-sky-100 text-sky-700 border-sky-200 font-bold ring-1 ring-sky-200 shadow-sm",
    "※": "bg-slate-100 text-slate-600 border-slate-200 font-medium ring-1 ring-slate-200"
};

const VPBadge = ({ type, print: isPrint }: { type: string; print?: boolean }) => {
    if (!type) return <span className="text-slate-200 font-light">-</span>;

    if (isPrint) {
        return (
            <span className="inline-flex items-center justify-center w-6 h-6 border border-slate-300 rounded font-bold text-xs">
                {type}
            </span>
        );
    }

    return (
        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-all ${styles[type] || ""}`}>
            {type}
        </span>
    );
};

export default VPBadge;
