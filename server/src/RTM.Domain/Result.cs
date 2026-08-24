namespace RTM.Domain;

/// <summary>
/// Explicitly carries a successful payload or a failure reason — never throws
/// for expected errors (Result pattern). Used by the Application layer so that
/// expected validation/store failures travel as values, not exceptions.
/// </summary>
public sealed class Result<T>
{
    private Result(bool isSuccess, T? value, string? error)
    {
        IsSuccess = isSuccess;
        Value = value;
        Error = error;
    }

    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;
    public T? Value { get; }
    public string? Error { get; }

    public static Result<T> Success(T value) => new(true, value, null);

    public static Result<T> Failure(string error) => new(false, default, error);
}
