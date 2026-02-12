#include <cuda_runtime.h>
#include <cstdio>

__global__ void saxpy(int n, float a, const float* x, float* y) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) y[i] = a * x[i] + y[i];
}

int main() {
    const int n = 1 << 20;
    size_t bytes = n * sizeof(float);

    float *x, *y;
    cudaMallocManaged(&x, bytes);
    cudaMallocManaged(&y, bytes);

    for (int i = 0; i < n; i++) { x[i] = 1.0f; y[i] = 2.0f; }

    int threads = 256;
    int blocks = (n + threads - 1) / threads;

    saxpy<<<blocks, threads>>>(n, 2.0f, x, y);
    cudaDeviceSynchronize();

    printf("y[0]=%f y[n-1]=%f\n", y[0], y[n - 1]);

    cudaFree(x);
    cudaFree(y);
    return 0;
}
